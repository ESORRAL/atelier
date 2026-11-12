use super::*;
use std::os::unix::fs::symlink;

fn tmp(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("atelier-vault-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    fs::canonicalize(d).unwrap()
}

#[test]
fn path_validation() {
    let root = tmp("paths");
    fs::write(root.join("a.md"), "x").unwrap();
    fs::write(root.join("a.txt"), "x").unwrap();
    let outside = tmp("paths-out");
    fs::write(outside.join("s.md"), "secret").unwrap();
    symlink(outside.join("s.md"), root.join("link.md")).unwrap();
    symlink(&outside, root.join("dir")).unwrap();
    assert!(resolve(&root, "a.md").is_ok());
    for bad in [
        "../x.md",
        "/etc/passwd",
        "a.txt",
        "link.md",
        "dir/s.md",
        "a/../a.md",
    ] {
        assert!(resolve(&root, bad).is_err(), "{bad}");
    }
}

#[test]
fn search_ignores_case_and_accents() {
    let root = tmp("search");
    fs::write(root.join("n.md"), "# Titre\nUne Réunion importante\n").unwrap();
    let h = search(&root, "reunion").unwrap();
    assert_eq!(h.len(), 1);
    assert_eq!((h[0].line, h[0].title.as_str()), (2, "Titre"));
    assert!(h[0].excerpt.contains("Réunion"));
    assert!(search(&root, "a").is_err());
    assert!(search(&root, "zzz").unwrap().is_empty());
}

#[test]
fn journal_insertion() {
    let root = tmp("journal");
    let j = root.join("Journal.md");
    append_journal(&root, "A").unwrap(); // missing file
    assert_eq!(fs::read_to_string(&j).unwrap(), "A\n");
    fs::write(&j, "# Journal\n\nold\n").unwrap();
    append_journal(&root, "B").unwrap();
    assert_eq!(fs::read_to_string(&j).unwrap(), "# Journal\n\nB\n\n\nold\n");
    fs::write(&j, "old\n").unwrap(); // no title
    append_journal(&root, "C").unwrap();
    assert_eq!(fs::read_to_string(&j).unwrap(), "C\n\nold\n");
    assert!(append_journal(&root, "").is_err());
}

#[test]
fn journal_refuses_symlinks_and_binary() {
    let root = tmp("jsym");
    let outside = tmp("jsym-out");
    fs::write(outside.join("t.md"), "target").unwrap();
    // planted temp-name symlinks are never followed (unique names, O_EXCL)
    symlink(outside.join("t.md"), root.join("Journal.md.tmp")).unwrap();
    append_journal(&root, "A").unwrap();
    assert_eq!(fs::read_to_string(outside.join("t.md")).unwrap(), "target");
    fs::remove_file(root.join("Journal.md")).unwrap();
    // Journal.md itself a symlink: refused, target untouched
    symlink(outside.join("t.md"), root.join("Journal.md")).unwrap();
    assert!(append_journal(&root, "B").is_err());
    assert_eq!(fs::read_to_string(outside.join("t.md")).unwrap(), "target");
    // non-UTF-8 journal: refused, content kept
    fs::remove_file(root.join("Journal.md")).unwrap();
    fs::write(root.join("Journal.md"), [0xff, 0xfe, b'x']).unwrap();
    assert!(append_journal(&root, "C").is_err());
    assert_eq!(
        fs::read(root.join("Journal.md")).unwrap(),
        [0xff, 0xfe, b'x']
    );
}

#[test]
fn root_must_stay_under_vault() {
    let base = tmp("rootbase");
    let outside = tmp("rootout");
    fs::create_dir_all(base.join("P")).unwrap();
    symlink(&outside, base.join("evil")).unwrap();
    assert!(resolve_root(&base, "P").is_ok());
    assert!(resolve_root(&base, "evil").is_err());
}

#[test]
fn hidden_dirs_skipped_and_empty_project_url() {
    let root = tmp("hidden");
    fs::create_dir_all(root.join(".obsidian")).unwrap();
    fs::write(root.join(".obsidian/x.md"), "needle").unwrap();
    fs::write(root.join("a.md"), "needle").unwrap();
    assert_eq!(recent(&root, 10).unwrap().len(), 1);
    assert!(list(&root, Some(".obsidian")).is_err());
    assert_eq!(search(&root, "needle").unwrap().len(), 1);
    assert_eq!(
        obsidian_url("V", "a.md"),
        "obsidian://open?vault=V&file=a.md"
    );
}

#[test]
fn url_is_encoded() {
    let u = obsidian_url("My Vault", "01/é.md");
    assert!(u.starts_with("obsidian://open?vault=My%20Vault&file="));
    assert!(!u.contains(' '));
}

/// Read-only trial on the real vault: `cargo test -- --ignored`.
#[test]
#[ignore]
fn real_vault_read_only() {
    let base = Path::new("/home/thomas/Documents/Obsidian Vault");
    let root = resolve_vault(base).unwrap();
    let notes = recent(&root, 50).unwrap();
    let top = list(&root, None).unwrap();
    println!("{} recent, {} folders", notes.len(), top.folders.len());
    if let Some(n) = notes.first() {
        read(&root, &n.path).unwrap();
    }
}

#[test]
fn list_folder_levels_and_escapes() {
    let root = tmp("folder");
    fs::create_dir_all(root.join("A/B")).unwrap();
    fs::write(root.join("top.md"), "# Top").unwrap();
    fs::write(root.join("A/n.md"), "x").unwrap();
    fs::write(root.join("A/B/deep.md"), "x").unwrap();
    let outside = tmp("folder-out");
    symlink(&outside, root.join("out")).unwrap();
    let r = list(&root, None).unwrap();
    assert_eq!(
        (r.folders.as_slice(), r.notes.len()),
        (&["A".to_string()][..], 1)
    );
    let a = list(&root, Some("A")).unwrap();
    assert_eq!(
        (a.path.as_str(), a.folders.as_slice()),
        ("A", &["B".to_string()][..])
    );
    assert_eq!(a.notes[0].path, "A/n.md");
    assert_eq!(recent(&root, 2).unwrap().len(), 2);
    assert!(recent(&root, 0).is_err() && recent(&root, 51).is_err());
    for bad in ["..", "A/../..", "/etc", "out", "top.md"] {
        assert!(list(&root, Some(bad)).is_err(), "{bad}");
    }
}
