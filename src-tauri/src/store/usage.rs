//! Usage aggregation: see contracts/ipc.md §7.
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsage {
    pub cost_usd: f64,
    pub input_tokens: u64,
    pub output_tokens: u64,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsageDay {
    pub day: String,
    pub cost_usd: f64,
    pub by_model: BTreeMap<String, ModelUsage>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummary {
    pub days: Vec<UsageDay>,
    pub total_cost_usd: f64,
    pub by_model: BTreeMap<String, ModelUsage>,
}

/// Days since 1970-01-01 of the civil date (Hinnant's algorithm).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    era * 146097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719468
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

/// Local calendar day (days since epoch, local time) of a timestamp in milliseconds.
pub fn local_day(ms: u64) -> i64 {
    let t = (ms / 1000) as libc::time_t;
    let mut tm: libc::tm = unsafe { std::mem::zeroed() };
    unsafe { libc::localtime_r(&t, &mut tm) };
    days_from_civil(
        i64::from(tm.tm_year) + 1900,
        i64::from(tm.tm_mon) + 1,
        i64::from(tm.tm_mday),
    )
}

/// Last `result` event's `modelUsage` in a journal; `None` if there is none.
pub fn last_model_usage(events: &[Value]) -> Option<Value> {
    events
        .iter()
        .rev()
        .find(|e| e["kind"] == "sdk" && e["message"]["type"] == "result")
        .map(|e| e["message"]["modelUsage"].clone())
}

/// Pure aggregation. `sessions`: (`updatedAt` ms, last `modelUsage`). `day_of` maps ms to a local day number.
pub fn summarize(
    sessions: &[(u64, Option<Value>)],
    now_ms: u64,
    days: u32,
    day_of: impl Fn(u64) -> i64,
) -> UsageSummary {
    let today = day_of(now_ms);
    let first = today - i64::from(days) + 1;
    let mut per_day: BTreeMap<i64, BTreeMap<String, ModelUsage>> =
        (first..=today).map(|d| (d, BTreeMap::new())).collect();
    for (updated_at, usage) in sessions {
        let Some(models) = per_day.get_mut(&day_of(*updated_at)) else {
            continue;
        };
        let Some(obj) = usage.as_ref().and_then(Value::as_object) else {
            continue;
        };
        for (name, u) in obj {
            let m = models.entry(name.clone()).or_default();
            m.cost_usd += u["costUSD"].as_f64().unwrap_or(0.0);
            m.input_tokens += u["inputTokens"].as_u64().unwrap_or(0);
            m.output_tokens += u["outputTokens"].as_u64().unwrap_or(0);
        }
    }
    let mut by_model: BTreeMap<String, ModelUsage> = BTreeMap::new();
    let days = per_day
        .into_iter()
        .map(|(d, models)| {
            for (name, u) in &models {
                let t = by_model.entry(name.clone()).or_default();
                t.cost_usd += u.cost_usd;
                t.input_tokens += u.input_tokens;
                t.output_tokens += u.output_tokens;
            }
            let (y, m, dd) = civil_from_days(d);
            UsageDay {
                day: format!("{y:04}-{m:02}-{dd:02}"),
                cost_usd: models.values().map(|u| u.cost_usd).sum(),
                by_model: models,
            }
        })
        .collect::<Vec<_>>();
    UsageSummary {
        total_cost_usd: days.iter().map(|d| d.cost_usd).sum(),
        days,
        by_model,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const DAY: u64 = 86_400_000;
    // 2024-03-10 12:00 UTC
    const NOW: u64 = 1_710_072_000_000;
    fn utc(ms: u64) -> i64 {
        (ms / DAY) as i64
    }
    fn usage(model: &str, cost: f64, i: u64, o: u64) -> Option<Value> {
        Some(json!({model: {"costUSD": cost, "inputTokens": i, "outputTokens": o}}))
    }

    #[test]
    fn aggregates_days_and_models() {
        let s = vec![
            (NOW, usage("a", 1.0, 10, 5)),
            (NOW - 1000, usage("a", 0.5, 4, 1)),
            (NOW, usage("b", 2.0, 1, 1)),
            (NOW - 2 * DAY, usage("b", 3.0, 7, 7)),
            (NOW - 10 * DAY, usage("a", 99.0, 1, 1)), // outside the window
            (NOW, None),                              // corrupt or missing journal
        ];
        let r = summarize(&s, NOW, 3, utc);
        let days: Vec<_> = r.days.iter().map(|d| d.day.as_str()).collect();
        assert_eq!(days, ["2024-03-08", "2024-03-09", "2024-03-10"]);
        assert_eq!(r.days[1].cost_usd, 0.0);
        assert_eq!(r.days[2].cost_usd, 3.5);
        assert_eq!(r.days[2].by_model["a"].input_tokens, 14);
        assert_eq!(r.total_cost_usd, 6.5);
        assert_eq!(r.by_model["b"].cost_usd, 5.0);
        assert_eq!(r.by_model["b"].output_tokens, 8);
    }

    #[test]
    fn last_result_wins_and_garbage_is_ignored() {
        let ev = vec![
            json!({"kind":"sdk","message":{"type":"result","modelUsage":{"a":{"costUSD":1.0}}}}),
            json!({"kind":"sdk","message":{"type":"result","modelUsage":{"a":{"costUSD":2.0}}}}),
            json!({"kind":"user","text":"x"}),
        ];
        assert_eq!(last_model_usage(&ev).unwrap()["a"]["costUSD"], 2.0);
        assert!(last_model_usage(&[]).is_none());
    }

    #[test]
    fn civil_round_trip() {
        assert_eq!(civil_from_days(days_from_civil(2024, 2, 29)), (2024, 2, 29));
    }
}
