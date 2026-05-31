#!/usr/bin/env python3
import subprocess
import sys
import json
import requests
import click
import re
import time
from typing import List, Tuple

DEFAULT_LLM_URL = "http://localhost:11434/api/generate"
DEFAULT_MODEL = "qwen2.5-coder:7b"

MAX_DIFF_CHARS = 8000
MAX_LINES_PER_FILE = 50
MAX_RETRIES = 3
RETRY_DELAY = 2
CANDIDATE_COUNT = 5

SYSTEM_PROMPT = f"""你是一个专业的Git提交信息生成助手。根据提供的git diff内容，生成{CANDIDATE_COUNT}个符合Conventional Commits规范的候选提交信息。

Conventional Commits规范:
- feat: 新功能
- fix: 修复bug
- docs: 文档更新
- style: 代码格式调整
- refactor: 代码重构
- test: 测试相关
- chore: 构建/工具链相关

要求:
1. 每个候选严格按照格式: <type>(<scope>): <subject>
2. 每行不超过50个字符
3. 只返回{CANDIDATE_COUNT}个候选，每行一个，不要编号，不要其他解释
4. 每个候选从不同角度描述变更，提供多样化的选择
5. 准确描述变更内容，优先关注最重要的修改
"""

def get_staged_diff():
    try:
        result = subprocess.run(
            ["git", "diff", "--cached", "--no-color"],
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout
    except subprocess.CalledProcessError as e:
        click.echo(f"获取git diff失败: {e.stderr}", err=True)
        sys.exit(1)

def get_staged_files() -> List[str]:
    try:
        result = subprocess.run(
            ["git", "diff", "--cached", "--name-only"],
            capture_output=True,
            text=True,
            check=True
        )
        files = result.stdout.strip().split('\n')
        return [f for f in files if f]
    except subprocess.CalledProcessError as e:
        click.echo(f"获取暂存文件列表失败: {e.stderr}", err=True)
        return []

def parse_diff_by_files(diff_content: str) -> List[Tuple[str, str]]:
    if not diff_content.strip():
        return []
    
    file_pattern = re.compile(r'^diff --git a/(.+?) b/\1', re.MULTILINE)
    matches = list(file_pattern.finditer(diff_content))
    
    file_diffs = []
    for i, match in enumerate(matches):
        filename = match.group(1)
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(diff_content)
        file_diff = diff_content[start:end]
        file_diffs.append((filename, file_diff))
    
    return file_diffs

def truncate_file_diff(file_diff: str, max_lines: int = MAX_LINES_PER_FILE) -> str:
    lines = file_diff.split('\n')
    if len(lines) <= max_lines:
        return file_diff
    
    header_lines = []
    for line in lines:
        header_lines.append(line)
        if line.startswith('+++') or line.startswith('---'):
            break
    
    body_start = len(header_lines)
    remaining = max_lines - len(header_lines)
    if remaining <= 0:
        return '\n'.join(header_lines) + '\n... [内容已截断]'
    
    truncated_body = lines[body_start:body_start + remaining]
    return '\n'.join(header_lines + truncated_body) + f'\n... [已截断，原文件共{len(lines)}行]'

def optimize_diff(diff_content: str, max_chars: int = MAX_DIFF_CHARS) -> str:
    if len(diff_content) <= max_chars:
        return diff_content
    
    click.echo(f"检测到大变更 ({len(diff_content)} 字符)，正在智能优化...")
    
    file_diffs = parse_diff_by_files(diff_content)
    if not file_diffs:
        return diff_content[:max_chars] + '\n... [内容已截断]'
    
    staged_files = get_staged_files()
    file_summary = f"变更文件摘要 ({len(staged_files)}个文件):\n"
    for f in staged_files:
        file_summary += f"  - {f}\n"
    
    optimized_parts = [file_summary, "\n详细变更 (已优化):"]
    current_length = len(file_summary) + len("\n详细变更 (已优化):")
    
    for filename, file_diff in file_diffs:
        truncated = truncate_file_diff(file_diff)
        estimated_length = current_length + len(truncated) + 5
        
        if estimated_length > max_chars * 0.8:
            remaining = len(file_diffs) - file_diffs.index((filename, file_diff)) - 1
            if remaining > 0:
                optimized_parts.append(f"\n... 还有 {remaining} 个文件未显示")
            break
        
        optimized_parts.append(f"\n=== {filename} ===")
        optimized_parts.append(truncated)
        current_length = estimated_length
    
    result = '\n'.join(optimized_parts)
    click.echo(f"优化完成: {len(diff_content)} -> {len(result)} 字符")
    return result

def call_llm(diff_content: str, llm_url: str, model: str, retry_count: int = 0) -> List[str]:
    optimized_diff = optimize_diff(diff_content)
    prompt = f"{SYSTEM_PROMPT}\n\nGit diff内容:\n{optimized_diff}"
    
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "num_ctx": 4096,
            "temperature": 0.5
        }
    }
    
    try:
        response = requests.post(llm_url, json=payload, timeout=120)
        response.raise_for_status()
        result = response.json()
        response_text = result.get("response", "").strip()
        
        candidates = [line.strip() for line in response_text.split('\n') if line.strip() and ':' in line]
        candidates = list(dict.fromkeys(candidates))
        
        if not candidates:
            candidates = [response_text]
        
        return candidates[:CANDIDATE_COUNT]
    except requests.exceptions.RequestException as e:
        if retry_count < MAX_RETRIES:
            click.echo(f"调用失败，{RETRY_DELAY}秒后重试 ({retry_count + 1}/{MAX_RETRIES})...")
            time.sleep(RETRY_DELAY)
            return call_llm(diff_content, llm_url, model, retry_count + 1)
        click.echo(f"调用LLM接口失败: {e}", err=True)
        sys.exit(1)

def interactive_select(candidates: List[str]) -> str:
    if not candidates:
        return ""
    
    click.echo("\n" + "=" * 60)
    click.echo("📋 候选提交信息 (使用数字键选择):")
    click.echo("=" * 60)
    
    for i, candidate in enumerate(candidates, 1):
        click.echo(f"  {i}. {candidate}")
    
    click.echo(f"  {len(candidates) + 1}. ✏️  手动编辑")
    click.echo("=" * 60)
    
    while True:
        choice = click.prompt(f"\n请选择 (1-{len(candidates) + 1})", type=int, default=1)
        if 1 <= choice <= len(candidates):
            return candidates[choice - 1]
        elif choice == len(candidates) + 1:
            return manual_edit(candidates[0] if candidates else "")
        else:
            click.echo(f"请输入 1-{len(candidates) + 1} 之间的数字")

def manual_edit(default_text: str) -> str:
    click.echo("\n" + "=" * 60)
    click.echo("✏️  手动编辑模式")
    click.echo("=" * 60)
    click.echo(f"当前: {default_text}")
    click.echo("")
    
    new_text = click.prompt("请输入新的提交信息", default=default_text)
    return new_text.strip()

def confirm_commit(message: str) -> bool:
    click.echo("\n" + "=" * 60)
    click.echo("📝 最终提交信息:")
    click.echo("=" * 60)
    click.echo(f"  {message}")
    click.echo("=" * 60)
    
    return click.confirm("\n是否确认提交?", default=True)

def do_commit(message):
    try:
        subprocess.run(
            ["git", "commit", "-m", message],
            check=True,
            capture_output=True,
            text=True
        )
        click.echo("\n✅ 提交成功!")
        return True
    except subprocess.CalledProcessError as e:
        click.echo(f"提交失败: {e.stderr}", err=True)
        return False

@click.command()
@click.option("--llm-url", default=DEFAULT_LLM_URL, help="LLM接口地址")
@click.option("--model", default=DEFAULT_MODEL, help="使用的模型名称")
@click.option("--dry-run", is_flag=True, help="仅生成信息，不实际提交")
@click.option("--yes", "-y", is_flag=True, help="自动确认提交(使用第一个候选)")
@click.option("--no-interactive", is_flag=True, help="禁用交互式选择(直接使用第一个候选)")
def main(llm_url, model, dry_run, yes, no_interactive):
    diff = get_staged_diff()
    
    if not diff.strip():
        click.echo("暂存区没有变更，请先执行 git add 添加文件。", err=True)
        sys.exit(1)
    
    click.echo("正在分析代码变更...")
    candidates = call_llm(diff, llm_url, model)
    
    if not candidates:
        click.echo("未能生成有效的提交信息", err=True)
        sys.exit(1)
    
    if dry_run:
        click.echo("\n生成的候选提交信息:")
        for i, msg in enumerate(candidates, 1):
            click.echo(f"  {i}. {msg}")
        return
    
    if yes:
        commit_message = candidates[0]
    elif no_interactive:
        commit_message = candidates[0]
        if not confirm_commit(commit_message):
            click.echo("已取消提交")
            return
    else:
        commit_message = interactive_select(candidates)
        if not confirm_commit(commit_message):
            click.echo("已取消提交")
            return
    
    do_commit(commit_message)

if __name__ == "__main__":
    main()
