mod cli;
mod config;
mod parsers;
mod scanners;
mod reporters;
mod models;

use cli::Cli;
use clap::Parser;
use config::Config;
use scanners::Scanner;
use reporters::Reporter;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    let config = Config::from_cli(&cli)?;
    
    let scanner = Scanner::new(config.clone());
    let result = scanner.scan()?;
    
    let reporter = Reporter::new(config.clone());
    reporter.report(&result)?;
    
    if let Some(history_path) = &config.save_history {
        scanner.save_history(&result, history_path)?;
        println!("\nScan history saved to: {}", history_path.display());
    }
    
    if let Some(compare_path) = &config.compare_with {
        let comparison = scanner.compare_with_history(&result, compare_path)?;
        reporter.report_comparison(&comparison)?;
    }
    
    if config.ci_cd.fail_on_critical || config.ci_cd.fail_on_high || config.ci_cd.fail_on_medium {
        let passed = scanner.check_cicd(&result)?;
        if !passed {
            println!("\nCI/CD check FAILED - blocking build");
            std::process::exit(1);
        } else {
            println!("\nCI/CD check PASSED");
        }
    }
    
    Ok(())
}
