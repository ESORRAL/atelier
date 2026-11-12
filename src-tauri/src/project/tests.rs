use super::*;

#[test]
fn status_counts_dirty_lines() {
    let out = " M src-tauri/src/lib.rs\n?? src-tauri/src/project/\nA  tasks/x.md\n";
    assert_eq!(parse_status_count(out), 3);
    assert_eq!(parse_status_count(""), 0);
}

#[test]
fn worktrees_porcelain() {
    let out = "worktree /r\nHEAD 654a05871b91a7d7ef425ff2e6b195850ce37cd0\nbranch refs/heads/main\n\n\
worktree /r/.claude/worktrees/a1\nHEAD 39cbbec00000000000000000000000000000000\ndetached\nlocked claude agent a1 (pid 1)\n\n";
    let w = parse_worktrees(out);
    assert_eq!(w.len(), 2);
    assert_eq!(w[0].branch.as_deref(), Some("main"));
    assert!(!w[0].locked);
    assert_eq!(w[1].branch, None);
    assert!(w[1].locked);
    assert_eq!(w[1].path, "/r/.claude/worktrees/a1");
}

#[test]
fn log_units_and_ms() {
    let out = "654a058\x1fMerge pull request #60 from x/y\x1f1794426114\n2d5e755\x1fdocs: a: b\x1f1794426108\nbad line\n";
    let c = parse_log(out);
    assert_eq!(c.len(), 2);
    assert_eq!(c[0].subject, "Merge pull request #60 from x/y");
    assert_eq!(c[0].date, 1794426114000);
    assert_eq!(c[1].subject, "docs: a: b");
}

#[test]
fn task_header() {
    let md = "---\nid: TASK-036\ntitle: Module project — infos: git\nstatus: todo\n# comment: ignored\nphase: 5\nagent: core\nmodel: sonnet\ndepends_on: []\n---\n\n## Objectif\nid: nope\n";
    let t = parse_task_header(md, "tasks/TASK-036.md").unwrap();
    assert_eq!(t.id, "TASK-036");
    assert_eq!(t.title, "Module project — infos: git");
    assert_eq!(t.status, "todo");
    assert_eq!(t.agent.as_deref(), Some("core"));
    assert_eq!(t.model.as_deref(), Some("sonnet"));
    assert!(parse_task_header("# no header", "f").is_none());
    assert!(parse_task_header("---\nid: X\nno end", "f").is_none());
}

#[test]
fn graph_degrees_and_communities() {
    let json = r#"{"nodes":[
      {"id":"a","label":"A","community":1,"community_name":"Chat","source_file":"a.ts"},
      {"id":"b","label":"B","community":1,"community_name":"Chat","source_file":"b.ts"},
      {"id":"c","label":"C","community":2,"community_name":"Bridge"}],
      "links":[{"source":"a","target":"b"},{"source":"a","target":"c"}],
      "built_at_commit":"abc"}"#;
    let g = parse_graph(json, Some("def".into()), None).unwrap();
    assert_eq!((g.nodes, g.edges), (3, 2));
    assert_eq!(g.built_at_commit.as_deref(), Some("abc"));
    assert_eq!(g.head_commit.as_deref(), Some("def"));
    assert_eq!(g.top_nodes[0].label, "A");
    assert_eq!(g.top_nodes[0].degree, 2);
    assert_eq!(g.top_nodes[2].file, None);
    assert_eq!(
        g.communities[0],
        Community {
            id: 1,
            name: "Chat".into(),
            size: 2
        }
    );
    assert!(parse_graph("nope", None, None).is_none());
}

// Real runs on the repo and on Graphify's real graph.json (read only); skipped when absent.
const MAIN_CHECKOUT: &str = "/home/thomas/Documents/Perso/claude_linux";

#[tokio::test]
async fn real_project_info() {
    let root = concat!(env!("CARGO_MANIFEST_DIR"), "/..");
    let i = info(root).await.unwrap();
    assert!(i.is_git);
    assert!(!i.recent_commits.is_empty());
    assert!(!i.worktrees.is_empty());
    assert!(i.tasks.iter().any(|t| t.id == "TASK-036"));
}

#[tokio::test]
async fn non_git_dir_is_empty_not_error() {
    let d = std::env::temp_dir().join("atelier-nongit-036");
    std::fs::create_dir_all(&d).unwrap();
    let i = info(d.to_str().unwrap()).await.unwrap();
    assert_eq!(i, ProjectInfo::default());
}

#[tokio::test]
async fn real_graph_summary() {
    if !Path::new(MAIN_CHECKOUT)
        .join("graphify-out/graph.json")
        .exists()
    {
        return;
    }
    let g = summary(MAIN_CHECKOUT).await.unwrap().unwrap();
    assert!(g.nodes > 0 && g.edges > 0);
    assert!(g.top_nodes.len() <= 25 && g.communities.len() <= 30);
    assert!(g.built_at_commit.is_some() && g.head_commit.is_some());
}

#[tokio::test]
async fn run_times_out_and_reports_missing_binary() {
    let e = run("sleep", &["5"], "/tmp", Duration::from_millis(200)).await;
    assert!(e.unwrap_err().contains("délai"));
    let e = run("no-such-binary-036", &[], "/tmp", Duration::from_secs(1)).await;
    assert!(e.unwrap_err().contains("introuvable"));
}

// Runs the real `graphify update .` on this repo (slow, writes graphify-out/): `cargo test -- --ignored`.
#[tokio::test]
#[ignore]
async fn real_graph_update() {
    let root = concat!(env!("CARGO_MANIFEST_DIR"), "/..");
    let g = commands::graph_update(root.into()).await.unwrap();
    assert!(g.nodes > 0);
}

#[test]
fn files_rank_prefix_then_substring_folded() {
    let p: Vec<String> = [
        "docs/Résumé.md",
        "src/a/resume_long.ts",
        "x/my-resume.md",
        "resume.md",
        "other.md",
    ]
    .map(String::from)
    .to_vec();
    assert_eq!(
        rank_files(&p, "RESUME", 10),
        [
            "resume.md",
            "docs/Résumé.md",
            "src/a/resume_long.ts",
            "x/my-resume.md"
        ]
    );
    assert_eq!(rank_files(&p, "resume", 2).len(), 2);
    assert!(rank_files(&p, "zzz", 5).is_empty());
}

#[tokio::test]
async fn files_real_repo_and_walk() {
    let root = concat!(env!("CARGO_MANIFEST_DIR"), "/..");
    let r = files(root, "lib.rs", 3).await.unwrap();
    assert_eq!(r[0], "src-tauri/src/lib.rs");
    assert_eq!(files(root, "", 5).await.unwrap().len(), 5);
    let w = walk_files(Path::new(root));
    assert!(w.iter().any(|p| p == "src-tauri/src/lib.rs"));
    assert!(
        !w.iter()
            .any(|p| p.starts_with(".git/") || p.contains("node_modules/"))
    );
}
