//! Module `project`: see contracts/ipc.md §11-12. Read-only git, task cards, Graphify summary.

use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tokio::io::AsyncReadExt;
use tokio::process::Command;

use crate::claude::validate_cwd;
use crate::supervisor;

const GIT_TIMEOUT: Duration = Duration::from_secs(10);
pub const GRAPH_TIMEOUT: Duration = Duration::from_secs(180);
const REPORT_MAX: u64 = 256 * 1024;

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    pub path: String,
    pub branch: Option<String>,
    pub head: String,
    pub locked: bool,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub hash: String,
    pub subject: String,
    pub date: i64,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub status: String,
    pub agent: Option<String>,
    pub model: Option<String>,
    pub file: String,
}

#[derive(Serialize, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub is_git: bool,
    pub branch: Option<String>,
    pub dirty_files: usize,
    pub worktrees: Vec<Worktree>,
    pub recent_commits: Vec<Commit>,
    pub tasks: Vec<Task>,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Community {
    pub id: i64,
    pub name: String,
    pub size: usize,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TopNode {
    pub label: String,
    pub degree: usize,
    pub file: Option<String>,
    pub community: Option<String>,
}

#[derive(Serialize, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GraphSummary {
    pub nodes: usize,
    pub edges: usize,
    pub built_at_commit: Option<String>,
    pub head_commit: Option<String>,
    pub communities: Vec<Community>,
    pub top_nodes: Vec<TopNode>,
    pub report_markdown: Option<String>,
}

// ---- pure parsers ----

/// `git status --porcelain`: one line per dirty path.
pub fn parse_status_count(out: &str) -> usize {
    out.lines().filter(|l| !l.trim().is_empty()).count()
}

/// `git worktree list --porcelain`: blocks separated by a blank line.
pub fn parse_worktrees(out: &str) -> Vec<Worktree> {
    out.split("\n\n")
        .filter_map(|block| {
            let mut w = Worktree {
                path: String::new(),
                branch: None,
                head: String::new(),
                locked: false,
            };
            for line in block.lines() {
                if let Some(p) = line.strip_prefix("worktree ") {
                    w.path = p.to_string();
                } else if let Some(h) = line.strip_prefix("HEAD ") {
                    w.head = h.to_string();
                } else if let Some(b) = line.strip_prefix("branch ") {
                    w.branch = Some(b.strip_prefix("refs/heads/").unwrap_or(b).to_string());
                } else if line == "locked" || line.starts_with("locked ") {
                    w.locked = true;
                }
            }
            (!w.path.is_empty()).then_some(w)
        })
        .collect()
}

/// `git log --format=%H%x1f%s%x1f%ct`: date converted to Unix milliseconds.
pub fn parse_log(out: &str) -> Vec<Commit> {
    out.lines()
        .filter_map(|l| {
            let mut f = l.split('\x1f');
            let (hash, subject, ct) = (f.next()?, f.next()?, f.next()?);
            Some(Commit {
                hash: hash.to_string(),
                subject: subject.to_string(),
                date: ct.trim().parse::<i64>().ok()? * 1000,
            })
        })
        .collect()
}

/// Simple YAML header of a task card: `key: value` lines between two `---`, `#` lines ignored.
pub fn parse_task_header(text: &str, file: &str) -> Option<Task> {
    let mut lines = text.lines();
    if lines.next()?.trim() != "---" {
        return None;
    }
    let mut kv: HashMap<&str, String> = HashMap::new();
    for line in lines {
        if line.trim() == "---" {
            let mut get = |k| kv.remove(k).filter(|v| !v.is_empty());
            return Some(Task {
                id: get("id")?,
                title: get("title").unwrap_or_default(),
                status: get("status").unwrap_or_default(),
                agent: get("agent"),
                model: get("model"),
                file: file.to_string(),
            });
        }
        if line.trim_start().starts_with('#') {
            continue;
        }
        if let Some((k, v)) = line.split_once(':') {
            let v = v.trim().trim_matches(|c| c == '"' || c == '\'');
            kv.insert(k.trim(), v.to_string());
        }
    }
    None
}

/// `graph.json` (Graphify): degree = number of links touching a node.
pub fn parse_graph(
    json: &str,
    head: Option<String>,
    report: Option<String>,
) -> Option<GraphSummary> {
    let v: Value = serde_json::from_str(json).ok()?;
    let nodes = v.get("nodes")?.as_array()?;
    let links = v
        .get("links")
        .and_then(Value::as_array)
        .map_or(&[][..], |l| l);
    let mut degree: HashMap<&str, usize> = HashMap::new();
    for l in links {
        for end in ["source", "target"] {
            if let Some(id) = l.get(end).and_then(Value::as_str) {
                *degree.entry(id).or_default() += 1;
            }
        }
    }
    let mut comms: HashMap<i64, (String, usize)> = HashMap::new();
    let mut top: Vec<TopNode> = Vec::with_capacity(nodes.len());
    for n in nodes {
        let s = |k| n.get(k).and_then(Value::as_str).map(String::from);
        if let Some(c) = n.get("community").and_then(Value::as_i64) {
            let e = comms
                .entry(c)
                .or_insert_with(|| (s("community_name").unwrap_or_default(), 0));
            e.1 += 1;
        }
        top.push(TopNode {
            label: s("label").unwrap_or_default(),
            degree: n
                .get("id")
                .and_then(Value::as_str)
                .map_or(0, |i| degree.get(i).copied().unwrap_or(0)),
            file: s("source_file"),
            community: s("community_name"),
        });
    }
    top.sort_by_key(|n| std::cmp::Reverse(n.degree));
    top.truncate(25);
    let mut communities: Vec<Community> = comms
        .into_iter()
        .map(|(id, (name, size))| Community { id, name, size })
        .collect();
    communities.sort_by(|a, b| b.size.cmp(&a.size).then(a.id.cmp(&b.id)));
    communities.truncate(30);
    Some(GraphSummary {
        nodes: nodes.len(),
        edges: links.len(),
        built_at_commit: v
            .get("built_at_commit")
            .and_then(Value::as_str)
            .map(String::from),
        head_commit: head,
        communities,
        top_nodes: top,
        report_markdown: report,
    })
}

// ---- process and file plumbing ----

/// Runs `program args` in `dir` under the supervisor; kills the group on timeout.
pub async fn run(
    program: &str,
    args: &[&str],
    dir: &str,
    timeout: Duration,
) -> Result<String, String> {
    let mut cmd = Command::new(program);
    cmd.args(args).current_dir(dir);
    let mut child = supervisor::spawn(cmd).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            format!("{program} est introuvable (est-il installé et dans le PATH ?)")
        } else {
            format!("Lancement de {program} impossible : {e}")
        }
    })?;
    drop(child.stdin.take());
    let (Some(mut out), Some(mut err)) = (child.stdout.take(), child.stderr.take()) else {
        return Err(format!("{program} : sorties indisponibles"));
    };
    let work = async {
        let (mut o, mut e) = (Vec::new(), Vec::new());
        let (a, b) = tokio::join!(out.read_to_end(&mut o), err.read_to_end(&mut e));
        a.and(b).map_err(|e| e.to_string())?;
        let status = child.wait().await.map_err(|e| e.to_string())?;
        Ok::<_, String>((status, o, e))
    };
    let res = tokio::time::timeout(timeout, work).await;
    child.kill();
    let (status, o, e) =
        res.map_err(|_| format!("{program} : délai dépassé ({} s)", timeout.as_secs()))??;
    if status.success() {
        Ok(String::from_utf8_lossy(&o).into_owned())
    } else {
        Err(format!(
            "{program} a échoué : {}",
            String::from_utf8_lossy(&e).trim()
        ))
    }
}

async fn git(dir: &str, args: &[&str]) -> Result<String, String> {
    run("git", args, dir, GIT_TIMEOUT).await
}

fn read_tasks(dir: &str) -> Vec<Task> {
    let Ok(rd) = std::fs::read_dir(Path::new(dir).join("tasks")) else {
        return vec![];
    };
    let mut names: Vec<String> = rd
        .flatten()
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| n.starts_with("TASK-") && n.ends_with(".md"))
        .collect();
    names.sort();
    names
        .into_iter()
        .filter_map(|n| {
            let text = std::fs::read_to_string(Path::new(dir).join("tasks").join(&n)).ok()?;
            parse_task_header(&text, &format!("tasks/{n}"))
        })
        .collect()
}

fn read_report(dir: &str) -> Option<String> {
    use std::io::Read;
    let f = std::fs::File::open(Path::new(dir).join("graphify-out/GRAPH_REPORT.md")).ok()?;
    let mut buf = Vec::new();
    f.take(REPORT_MAX).read_to_end(&mut buf).ok()?;
    Some(String::from_utf8_lossy(&buf).into_owned())
}

pub async fn summary(dir: &str) -> Result<Option<GraphSummary>, String> {
    let Ok(json) = std::fs::read_to_string(Path::new(dir).join("graphify-out/graph.json")) else {
        return Ok(None);
    };
    let head = git(dir, &["rev-parse", "HEAD"])
        .await
        .ok()
        .map(|s| s.trim().to_string());
    parse_graph(&json, head, read_report(dir))
        .map(Some)
        .ok_or_else(|| "graph.json illisible".to_string())
}

pub async fn info(dir: &str) -> Result<ProjectInfo, String> {
    let dir = validate_cwd(dir)?;
    if git(&dir, &["rev-parse", "--is-inside-work-tree"])
        .await
        .is_err()
    {
        return Ok(ProjectInfo::default());
    }
    let branch = git(&dir, &["rev-parse", "--abbrev-ref", "HEAD"])
        .await
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|b| b != "HEAD");
    let dirty = git(&dir, &["status", "--porcelain"])
        .await
        .unwrap_or_default();
    let wt = git(&dir, &["worktree", "list", "--porcelain"])
        .await
        .unwrap_or_default();
    // An unborn branch has no log: empty list, not an error.
    let log = git(&dir, &["log", "--format=%H%x1f%s%x1f%ct", "-n", "10"])
        .await
        .unwrap_or_default();
    Ok(ProjectInfo {
        is_git: true,
        branch,
        dirty_files: parse_status_count(&dirty),
        worktrees: parse_worktrees(&wt),
        recent_commits: parse_log(&log),
        tasks: read_tasks(&dir),
    })
}

pub mod commands;

#[cfg(test)]
mod tests;
