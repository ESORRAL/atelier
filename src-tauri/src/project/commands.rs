use super::*;

#[tauri::command]
pub async fn project_info(dir: String) -> Result<ProjectInfo, String> {
    info(&dir).await
}

#[tauri::command]
pub async fn graph_summary(dir: String) -> Result<Option<GraphSummary>, String> {
    summary(&validate_cwd(&dir)?).await
}

#[tauri::command]
pub async fn graph_update(dir: String) -> Result<GraphSummary, String> {
    let dir = validate_cwd(&dir)?;
    run("graphify", &["update", "."], &dir, GRAPH_TIMEOUT).await?;
    summary(&dir)
        .await?
        .ok_or_else(|| "graphify n'a produit aucun graph.json".to_string())
}

#[tauri::command]
pub async fn project_files(
    dir: String,
    query: String,
    limit: usize,
) -> Result<Vec<String>, String> {
    files(&dir, &query, limit).await
}

#[tauri::command]
pub async fn graph_data(dir: String) -> Result<Option<GraphData>, String> {
    let dir = validate_cwd(&dir)?;
    let Ok(json) = std::fs::read_to_string(Path::new(&dir).join("graphify-out/graph.json")) else {
        return Ok(None);
    };
    parse_graph_data(&json)
        .map(Some)
        .ok_or_else(|| "graph.json illisible".to_string())
}
