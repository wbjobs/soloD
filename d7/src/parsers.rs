use crate::models::{Dependency, PackageManager};
use std::path::Path;
use serde_json::Value as JsonValue;
use roxmltree::Document;

pub trait Parser {
    fn can_parse(&self, path: &Path) -> bool;
    fn parse(&self, path: &Path) -> Result<Vec<Dependency>, Box<dyn std::error::Error>>;
}

pub struct NpmParser;

impl Parser for NpmParser {
    fn can_parse(&self, path: &Path) -> bool {
        path.file_name()
            .and_then(|n| n.to_str())
            .map(|s| s == "package.json" || s == "package-lock.json")
            .unwrap_or(false)
    }

    fn parse(&self, path: &Path) -> Result<Vec<Dependency>, Box<dyn std::error::Error>> {
        let content = std::fs::read_to_string(path)?;
        let json: JsonValue = serde_json::from_str(&content)?;
        let mut deps = Vec::new();

        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        
        if file_name == "package-lock.json" {
            if let Some(packages) = json["packages"].as_object() {
                for (pkg_path, pkg_info) in packages {
                    if pkg_path.is_empty() {
                        continue;
                    }
                    let name = pkg_info["name"].as_str()
                        .unwrap_or_else(|| pkg_path.split('/').last().unwrap_or(pkg_path));
                    if let Some(version) = pkg_info["version"].as_str() {
                        deps.push(Dependency {
                            name: name.to_string(),
                            version: version.to_string(),
                            manager: PackageManager::Npm,
                            path: path.to_string_lossy().to_string(),
                        });
                    }
                }
            }
        } else {
            if let Some(dependencies) = json["dependencies"].as_object() {
                for (name, version_info) in dependencies {
                    let version = version_info.as_str().unwrap_or("unknown");
                    let version = version.trim_start_matches(['^', '~', '>', '<', '=', '*']);
                    deps.push(Dependency {
                        name: name.clone(),
                        version: version.to_string(),
                        manager: PackageManager::Npm,
                        path: path.to_string_lossy().to_string(),
                    });
                }
            }
        }

        Ok(deps)
    }
}

pub struct PipParser;

impl Parser for PipParser {
    fn can_parse(&self, path: &Path) -> bool {
        path.file_name()
            .and_then(|n| n.to_str())
            .map(|s| s == "requirements.txt" || s == "Pipfile" || s == "pyproject.toml")
            .unwrap_or(false)
    }

    fn parse(&self, path: &Path) -> Result<Vec<Dependency>, Box<dyn std::error::Error>> {
        let content = std::fs::read_to_string(path)?;
        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        let mut deps = Vec::new();

        match file_name {
            "requirements.txt" => {
                for line in content.lines() {
                    let line = line.trim();
                    if line.is_empty() || line.starts_with('#') || line.starts_with('-') {
                        continue;
                    }
                    
                    let line = line.split(&['#', ';'][..]).next().unwrap_or("").trim();
                    if line.is_empty() {
                        continue;
                    }

                    if let Some((name, version)) = parse_requirement_line(line) {
                        if !name.is_empty() {
                            deps.push(Dependency {
                                name: name.to_string(),
                                version: version.unwrap_or("unknown".to_string()).to_string(),
                                manager: PackageManager::Pip,
                                path: path.to_string_lossy().to_string(),
                            });
                        }
                    }
                }
            }
            "Pipfile" => {
                let in_packages = false;
                for line in content.lines() {
                    let line = line.trim();
                    if line.starts_with("[packages]") {
                        continue;
                    }
                    if line.starts_with('[') {
                        continue;
                    }
                    if line.is_empty() || line.starts_with('#') {
                        continue;
                    }
                    let parts: Vec<&str> = line.split('=').collect();
                    if parts.len() >= 2 {
                        let name = parts[0].trim();
                        let version = parts[1].trim().trim_matches(&['"', '\''][..]);
                        deps.push(Dependency {
                            name: name.to_string(),
                            version: if version == "*" { "unknown".to_string() } else { version.to_string() },
                            manager: PackageManager::Pip,
                            path: path.to_string_lossy().to_string(),
                        });
                    }
                }
            }
            "pyproject.toml" => {
                let toml: toml::Value = toml::from_str(&content)?;
                if let Some(deps) = toml["project"]["dependencies"].as_array() {
                    for dep in deps {
                        if let Some(dep_str) = dep.as_str() {
                            let parts: Vec<&str> = dep_str.split(&['=', '>', '<', '!'][..]).collect();
                            if !parts.is_empty() {
                                let name = parts[0].trim();
                                let version = if dep_str.contains("==") {
                                    dep_str.split("==").nth(1).unwrap_or("").split(&[';', ' '][..]).next().unwrap_or("").trim()
                                } else {
                                    "unknown"
                                };
                                deps.push(Dependency {
                                    name: name.to_string(),
                                    version: version.to_string(),
                                    manager: PackageManager::Pip,
                                    path: path.to_string_lossy().to_string(),
                                });
                            }
                        }
                    }
                }
            }
            _ => {}
        }

        Ok(deps)
    }
}

pub struct MavenParser;

impl Parser for MavenParser {
    fn can_parse(&self, path: &Path) -> bool {
        path.file_name()
            .and_then(|n| n.to_str())
            .map(|s| s == "pom.xml")
            .unwrap_or(false)
    }

    fn parse(&self, path: &Path) -> Result<Vec<Dependency>, Box<dyn std::error::Error>> {
        let content = std::fs::read_to_string(path)?;
        let doc = Document::parse(&content)?;
        let mut deps = Vec::new();

        for dep in doc.descendants().filter(|n| n.tag_name().name() == "dependency") {
            let mut group_id = String::new();
            let mut artifact_id = String::new();
            let mut version = String::new();

            for child in dep.children() {
                match child.tag_name().name() {
                    "groupId" => group_id = child.text().unwrap_or("").to_string(),
                    "artifactId" => artifact_id = child.text().unwrap_or("").to_string(),
                    "version" => version = child.text().unwrap_or("").to_string(),
                    _ => {}
                }
            }

            if !artifact_id.is_empty() {
                let name = if group_id.is_empty() {
                    artifact_id
                } else {
                    format!("{}:{}", group_id, artifact_id)
                };
                deps.push(Dependency {
                    name,
                    version: if version.is_empty() { "unknown".to_string() } else { version },
                    manager: PackageManager::Maven,
                    path: path.to_string_lossy().to_string(),
                });
            }
        }

        Ok(deps)
    }
}

pub struct GoModParser;

impl Parser for GoModParser {
    fn can_parse(&self, path: &Path) -> bool {
        path.file_name()
            .and_then(|n| n.to_str())
            .map(|s| s == "go.mod")
            .unwrap_or(false)
    }

    fn parse(&self, path: &Path) -> Result<Vec<Dependency>, Box<dyn std::error::Error>> {
        let content = std::fs::read_to_string(path)?;
        let mut deps = Vec::new();
        let mut in_require = false;

        for line in content.lines() {
            let line = line.trim();
            
            if line.starts_with("require (") {
                in_require = true;
                continue;
            }
            if line == ")" && in_require {
                in_require = false;
                continue;
            }
            if line.starts_with("require ") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 3 {
                    let name = parts[1];
                    let version = parts[2].trim_start_matches('v');
                    deps.push(Dependency {
                        name: name.to_string(),
                        version: version.to_string(),
                        manager: PackageManager::GoMod,
                        path: path.to_string_lossy().to_string(),
                    });
                }
                continue;
            }
            
            if in_require && !line.is_empty() && !line.starts_with("//") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    let name = parts[0];
                    let version = parts[1].trim_start_matches('v');
                    deps.push(Dependency {
                        name: name.to_string(),
                        version: version.to_string(),
                        manager: PackageManager::GoMod,
                        path: path.to_string_lossy().to_string(),
                    });
                }
            }
        }

        Ok(deps)
    }
}

fn parse_requirement_line(line: &str) -> Option<(&str, Option<&str>)> {
    let operators = &["==", ">=", "<=", "!=", "~=", ">", "<"];
    
    for &op in operators {
        if let Some(pos) = line.find(op) {
            let name = line[0..pos].trim();
            let version_part = line[pos + op.len()..].trim();
            
            let version = if version_part.is_empty() {
                None
            } else {
                Some(version_part.split_whitespace().next().unwrap_or(""))
            };
            
            return Some((name, version));
        }
    }
    
    let name = line.split_whitespace().next().unwrap_or("");
    if name.is_empty() || name.contains('/') {
        None
    } else {
        Some((name, None))
    }
}

pub fn get_all_parsers() -> Vec<Box<dyn Parser>> {
    vec![
        Box::new(NpmParser),
        Box::new(PipParser),
        Box::new(MavenParser),
        Box::new(GoModParser),
    ]
}
