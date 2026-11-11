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
    let root = resolve_root(base, "01 - Projets/Atelier").unwrap();
    let notes = list(&root).unwrap();
    println!("{} notes", notes.len());
    if let Some(n) = notes.first() {
        read(&root, &n.path).unwrap();
    }
}
