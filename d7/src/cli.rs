use clap::Parser;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
pub struct Cli {
    #[arg(short, long, default_value = ".")]
    pub path: PathBuf,

    #[arg(short, long, value_enum, default_value = "text")]
    pub format: OutputFormat,

    #[arg(short, long)]
    pub output: Option<PathBuf>,

    #[arg(long)]
    pub ignore: Vec<String>,

    #[arg(long, default_value_t = 3)]
    pub depth: u32,

    #[arg(long, default_value_t = true, action = clap::ArgAction::Set)]
    pub osv: bool,

    #[arg(long, default_value_t = true, action = clap::ArgAction::Set)]
    pub nvd: bool,

    #[arg(long)]
    pub config: Option<PathBuf>,

    #[arg(long)]
    pub ci: bool,

    #[arg(long)]
    pub fail_on_critical: bool,

    #[arg(long)]
    pub fail_on_high: bool,

    #[arg(long)]
    pub fail_on_medium: bool,

    #[arg(long)]
    pub threshold: Option<usize>,

    #[arg(long)]
    pub compare_with: Option<PathBuf>,

    #[arg(long)]
    pub save_history: Option<PathBuf>,

    #[arg(long, default_value_t = false)]
    pub suggest_upgrades: bool,
}

#[derive(clap::ValueEnum, Debug, Clone, Copy)]
pub enum OutputFormat {
    Text,
    Json,
    Html,
}
