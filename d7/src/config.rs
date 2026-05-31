use crate::cli::{Cli, OutputFormat};
use crate::models::CiCdConfig;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub path: PathBuf,
    pub format: OutputFormat,
    pub output: Option<PathBuf>,
    pub ignore: Vec<String>,
    pub depth: u32,
    pub use_osv: bool,
    pub use_nvd: bool,
    pub ci_cd: CiCdConfig,
    pub compare_with: Option<PathBuf>,
    pub save_history: Option<PathBuf>,
    pub suggest_upgrades: bool,
}

impl Config {
    pub fn from_cli(cli: &Cli) -> Result<Self, Box<dyn std::error::Error>> {
        let mut ci_cd = CiCdConfig::default();
        
        if cli.ci {
            ci_cd.fail_on_critical = cli.fail_on_critical;
            ci_cd.fail_on_high = cli.fail_on_high;
            ci_cd.fail_on_medium = cli.fail_on_medium;
            ci_cd.threshold_count = cli.threshold;
        }

        if let Some(config_path) = &cli.config {
            if config_path.exists() {
                let content = std::fs::read_to_string(config_path)?;
                let file_config: FileConfig = serde_yaml::from_str(&content)?;
                return Ok(Self {
                    path: cli.path.clone(),
                    format: cli.format,
                    output: cli.output.clone(),
                    ignore: if cli.ignore.is_empty() {
                        file_config.ignore.unwrap_or_default()
                    } else {
                        cli.ignore.clone()
                    },
                    depth: if cli.depth == 3 {
                        file_config.depth.unwrap_or(3)
                    } else {
                        cli.depth
                    },
                    use_osv: cli.osv,
                    use_nvd: cli.nvd,
                    ci_cd,
                    compare_with: cli.compare_with.clone(),
                    save_history: cli.save_history.clone(),
                    suggest_upgrades: cli.suggest_upgrades,
                });
            }
        }

        Ok(Self {
            path: cli.path.clone(),
            format: cli.format,
            output: cli.output.clone(),
            ignore: cli.ignore.clone(),
            depth: cli.depth,
            use_osv: cli.osv,
            use_nvd: cli.nvd,
            ci_cd,
            compare_with: cli.compare_with.clone(),
            save_history: cli.save_history.clone(),
            suggest_upgrades: cli.suggest_upgrades,
        })
    }
}

#[derive(Debug, Deserialize)]
struct FileConfig {
    ignore: Option<Vec<String>>,
    depth: Option<u32>,
}
