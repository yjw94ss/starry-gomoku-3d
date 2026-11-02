#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把源码拼装成单文件 index.html（three.js 内联，离线可双击运行）。"""
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))


def read(*parts):
    p = os.path.join(ROOT, *parts)
    with open(p, "r", encoding="utf-8") as f:
        return f.read()


def main():
    tpl = read("src", "index.tpl.html")
    css = read("src", "style.css")
    three = read("assets", "three.min.js")
    logic = read("src", "js", "logic.js")
    scene = read("src", "js", "scene.js")
    app = read("src", "js", "app.js")

    payload = {
        "/*__CSS__*/": css,
        "/*__THREE__*/": three,
        "/*__LOGIC__*/": logic,
        "/*__SCENE__*/": scene,
        "/*__APP__*/": app,
    }

    # 注入前断言：脚本内容不能包含结束标签
    for key, val in payload.items():
        low = val.lower()
        assert "</script" not in low, "%s 中含有 </script" % key
        assert key in tpl, "模板缺少占位符 %s" % key

    out = tpl
    for key, val in payload.items():
        out = out.replace(key, val)

    # 标签配对自检
    for tag in ("script", "style", "div"):
        opens = len(re.findall(r"<" + tag + r"[\s>]", out))
        closes = len(re.findall(r"</" + tag + r">", out))
        assert opens == closes, "<%s> 标签不配对: %d / %d" % (tag, opens, closes)

    # 语法自检
    bundle = "\n".join([logic, scene, app])
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as f:
        f.write(bundle)
        tmp = f.name
    try:
        r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
        if r.returncode != 0:
            print(r.stderr, file=sys.stderr)
            raise SystemExit("JS 语法检查失败")
    finally:
        os.unlink(tmp)

    dst = os.path.join(ROOT, "index.html")
    with open(dst, "w", encoding="utf-8") as f:
        f.write(out)
    print("OK -> index.html  %.1f KB" % (len(out.encode("utf-8")) / 1024))


if __name__ == "__main__":
    main()
