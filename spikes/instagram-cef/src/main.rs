//! Spike TASK-050: minimal CEF browser (after cef-rs `cefsimple`) to measure Instagram Reels playback.
//! Env: URL (start page), SECS (run time), PROFILE (data dir), LOCAL=1 (also allow http://127.0.0.1),
//! NO_SANDBOX=1 (diagnostic only), PARENT=<XID> + BOUNDS=x,y,w,h (child window).
//! Prints `MEDIA <property>=<value>` for decoder-related media properties (DevTools `Media` domain,
//! observed from the browser process: nothing runs inside the page) and `BLOCKED <url>` for refused navigations.
use std::sync::{Arc, Mutex};

use cef::{args::Args, rc::*, *};

mod allow;

fn env(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|v| !v.is_empty())
}

type Shared = Arc<Mutex<Option<Browser>>>;

wrap_app! {
    struct ProbeApp { browser: Shared }
    impl App {
        fn on_before_command_line_processing(&self, _process_type: Option<&CefString>, command_line: Option<&mut CommandLine>) {
            let Some(cl) = command_line else { return };
            // Extra Chromium switches for experiments, e.g. EXTRA=--enable-features=VaapiVideoDecoder.
            for s in env("EXTRA").unwrap_or_default().split_whitespace() {
                let s = s.trim_start_matches("--");
                match s.split_once('=') {
                    Some((k, v)) => cl.append_switch_with_value(Some(&k.into()), Some(&v.into())),
                    None => cl.append_switch(Some(&s.into())),
                }
            }
        }
        fn browser_process_handler(&self) -> Option<BrowserProcessHandler> {
            Some(ProbeBrowserProcess::new(self.browser.clone()))
        }
    }
}

wrap_browser_process_handler! {
    struct ProbeBrowserProcess { browser: Shared }
    impl BrowserProcessHandler {
        fn on_context_initialized(&self) {
            let url = CefString::from(env("URL").unwrap_or("https://www.instagram.com/reels/".into()).as_str());
            let mut info = WindowInfo { runtime_style: RuntimeStyle::ALLOY, ..Default::default() };
            if let Some(p) = env("PARENT") {
                info.parent_window = p.parse().unwrap_or(0);
            }
            if let Some(b) = env("BOUNDS") {
                let v: Vec<i32> = b.split(',').filter_map(|x| x.parse().ok()).collect();
                if let [x, y, width, height] = v[..] {
                    info.bounds = Rect { x, y, width, height };
                }
            } else {
                info.bounds = Rect { x: 0, y: 0, width: 420, height: 900 };
            }
            let mut client = ProbeClient::new(self.browser.clone());
            browser_host_create_browser(Some(&info), Some(&mut client), Some(&url), Some(&BrowserSettings::default()), None, None);
        }
    }
}

wrap_client! {
    struct ProbeClient { browser: Shared }
    impl Client {
        fn life_span_handler(&self) -> Option<LifeSpanHandler> {
            Some(ProbeLifeSpan::new(self.browser.clone()))
        }
        fn request_handler(&self) -> Option<RequestHandler> {
            Some(ProbeRequest::new())
        }
        fn display_handler(&self) -> Option<DisplayHandler> {
            Some(ProbeDisplay::new())
        }
    }
}

wrap_display_handler! {
    struct ProbeDisplay;
    impl DisplayHandler {
        fn on_console_message(&self, _browser: Option<&mut Browser>, _level: LogSeverity, message: Option<&CefString>, source: Option<&CefString>, _line: ::std::os::raw::c_int) -> ::std::os::raw::c_int {
            // Only our local test page reports through the console; Instagram's messages are dropped.
            let src = source.map(|s| s.to_string()).unwrap_or_default();
            if src.starts_with("http://127.0.0.1") {
                println!("PAGE {}", message.map(|m| m.to_string()).unwrap_or_default());
            }
            1
        }
    }
}

wrap_request_handler! {
    struct ProbeRequest;
    impl RequestHandler {
        fn on_before_browse(&self, _browser: Option<&mut Browser>, _frame: Option<&mut Frame>, request: Option<&mut Request>, _user_gesture: ::std::os::raw::c_int, _is_redirect: ::std::os::raw::c_int) -> ::std::os::raw::c_int {
            let url = request.map(|r| CefString::from(&r.url()).to_string()).unwrap_or_default();
            if allow::allowed(&url, env("LOCAL").is_some()) {
                0
            } else {
                println!("BLOCKED {url}");
                1
            }
        }
    }
}

wrap_life_span_handler! {
    struct ProbeLifeSpan { browser: Shared }
    impl LifeSpanHandler {
        fn on_before_popup(&self, _browser: Option<&mut Browser>, _frame: Option<&mut Frame>, _popup_id: ::std::os::raw::c_int, target_url: Option<&CefString>, _target_frame_name: Option<&CefString>, _target_disposition: WindowOpenDisposition, _user_gesture: ::std::os::raw::c_int, _popup_features: Option<&PopupFeatures>, _window_info: Option<&mut WindowInfo>, _client: Option<&mut Option<Client>>, _settings: Option<&mut BrowserSettings>, _extra_info: Option<&mut Option<DictionaryValue>>, _no_javascript_access: Option<&mut ::std::os::raw::c_int>) -> ::std::os::raw::c_int {
            println!("BLOCKED popup {}", target_url.map(|u| u.to_string()).unwrap_or_default());
            1
        }
        fn on_after_created(&self, browser: Option<&mut Browser>) {
            let Some(b) = browser else { return };
            *self.browser.lock().unwrap() = Some(b.clone());
            if let Some(host) = b.host() {
                let mut obs = MediaObserver::new();
                // Leaked on purpose: the registration must live as long as the browser.
                std::mem::forget(host.add_dev_tools_message_observer(Some(&mut obs)));
                host.execute_dev_tools_method(1, Some(&"Media.enable".into()), None);
            }
            let secs: i64 = env("SECS").and_then(|s| s.parse().ok()).unwrap_or(30);
            post_delayed_task(ThreadId::UI, Some(&mut CloseTask::new(self.browser.clone())), secs * 1000);
        }
        fn on_before_close(&self, _browser: Option<&mut Browser>) {
            println!("CLOSE done");
            *self.browser.lock().unwrap() = None;
            quit_message_loop();
        }
    }
}

wrap_dev_tools_message_observer! {
    struct MediaObserver;
    impl DevToolsMessageObserver {
        fn on_dev_tools_event(&self, _browser: Option<&mut Browser>, method: Option<&CefString>, params: Option<&[u8]>) {
            if method.map(|m| m.to_string()).as_deref() != Some("Media.playerPropertiesChanged") {
                return;
            }
            let text = String::from_utf8_lossy(params.unwrap_or_default());
            // Keep decoder facts only, never URLs or page content.
            for key in ["kVideoDecoderName", "kIsPlatformVideoDecoder", "kVideoTracks", "kFramerate", "kAudioDecoderName", "kIsVideoDecryptingDemuxerStream", "kHardwareContextReset"] {
                if let Some(i) = text.find(&format!("\"name\":\"{key}\"")) {
                    let rest = &text[i..];
                    let val = rest.split("\"value\":").nth(1).and_then(|v| v.split('}').next()).unwrap_or("");
                    let val: String = val.chars().take(200).collect();
                    println!("MEDIA {key}={val}");
                }
            }
        }
    }
}

wrap_task! {
    struct CloseTask { browser: Shared }
    impl Task {
        fn execute(&self) {
            println!("CLOSE requested");
            // Release the lock first: close_browser re-enters on_before_close, which takes it.
            let host = self.browser.lock().unwrap().as_ref().and_then(|b| b.host());
            match host {
                Some(host) => {
                    host.close_browser(1);
                }
                None => quit_message_loop(),
            }
        }
    }
}

fn main() {
    let _ = api_hash(sys::CEF_API_VERSION_LAST, 0);
    let args = Args::new();
    let browser: Shared = Arc::new(Mutex::new(None));
    let mut app = ProbeApp::new(browser);
    let code = execute_process(
        Some(args.as_main_args()),
        Some(&mut app),
        std::ptr::null_mut(),
    );
    if code >= 0 {
        std::process::exit(code); // a CEF subprocess (renderer, GPU, ...) finished
    }
    let profile = env("PROFILE").unwrap_or_else(|| {
        format!(
            "{}/.cache/atelier-cef-spike/profile",
            env("HOME").unwrap_or_default()
        )
    });
    let settings = Settings {
        no_sandbox: env("NO_SANDBOX").is_some() as i32,
        root_cache_path: profile.as_str().into(),
        cache_path: profile.as_str().into(),
        log_severity: LogSeverity::WARNING,
        ..Default::default()
    };
    if initialize(
        Some(args.as_main_args()),
        Some(&settings),
        Some(&mut app),
        std::ptr::null_mut(),
    ) != 1
    {
        eprintln!("cef initialize failed");
        std::process::exit(1);
    }
    run_message_loop();
    shutdown();
}
