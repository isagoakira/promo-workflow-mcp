#!/usr/bin/env python3
"""Emit review signals for common AI-style risks in Chinese promotional copy.

This is deliberately a signal detector, not a pass/fail grammar checker. A
human or language model must inspect context before changing a finding.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


RULES: tuple[tuple[str, str, str, tuple[str, ...]], ...] = (
    (
        "forced-contrast",
        "review",
        "检查是否为了制造洞察感而强行对比；只有真实冲突才保留。",
        (r"不是.{0,45}而是", r"并非.{0,45}而是"),
    ),
    (
        "inflated-metaphor",
        "review",
        "把宏大比喻还原成对象、动作、状态或结果；有独特解释作用时可保留。",
        (r"达摩克利斯之剑", r"历史的十字路口", r"时代的风口", r"黄金钥匙", r"命运的齿轮", r"一场.{0,12}风暴"),
    ),
    (
        "repetitive-hype",
        "review",
        "删去没有新增事实的强调词，并合并重复判断。",
        (r"不仅仅是", r"不只是", r"深度拆解", r"底层逻辑", r"干货", r"获得感", r"专业感", r"全面赋能", r"系统性升级"),
    ),
    (
        "translation-residue",
        "review",
        "检查是否能改成作者会对同事说的自然中文；术语有必要时保留并解释。",
        (r"赋能", r"抓手", r"闭环", r"生态位", r"范式", r"颗粒度", r"方法论"),
    ),
    (
        "abstract-padding",
        "review",
        "用具体人、动作、对象、时间、状态或证据替代抽象形容词。",
        (r"深刻洞察", r"全面提升", r"真正实现", r"显著提升", r"高效协同", r"不可或缺", r"极大地"),
    ),
)


def excerpt(text: str, start: int, end: int, radius: int = 24) -> str:
    left = max(0, start - radius)
    right = min(len(text), end + radius)
    return " ".join(text[left:right].split())


def lint(text: str, source: str) -> dict[str, object]:
    findings: list[dict[str, str]] = []
    seen: set[tuple[str, int]] = set()
    for rule_id, severity, hint, patterns in RULES:
        for pattern in patterns:
            for match in re.finditer(pattern, text, flags=re.IGNORECASE):
                key = (rule_id, match.start())
                if key in seen:
                    continue
                seen.add(key)
                findings.append(
                    {
                        "ruleId": rule_id,
                        "severity": severity,
                        "excerpt": excerpt(text, match.start(), match.end()),
                        "message": hint,
                    }
                )
    findings.sort(key=lambda item: (text.find(item["excerpt"]), item["ruleId"]))
    return {
        "source": source,
        "summary": {
            "findingCount": len(findings),
            "note": "命中只是待复核信号，不是禁词判定。",
        },
        "findings": findings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", nargs="?", help="UTF-8 text/Markdown file; omit to read stdin")
    args = parser.parse_args()
    if args.path:
        path = Path(args.path)
        text = path.read_text(encoding="utf-8")
        source = str(path)
    else:
        text = sys.stdin.read()
        source = "stdin"
    json.dump(lint(text, source), sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
