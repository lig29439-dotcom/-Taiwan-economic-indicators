"""抓取所有指標原始資料，存到 data/raw/。

用法： python -m pipeline.fetch [指標id ...]

設計原則
- 每個指標獨立抓取；單一來源失敗時保留上次資料並記錄錯誤，不中斷其他指標。
- 新資料筆數比舊資料少超過 5% 時視為異常（來源格式變動或回傳不完整），保留舊資料。
- 抓取狀態寫入 data/raw/_status.json，網站會顯示各指標的更新狀態。
"""

from __future__ import annotations

import json
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path

from . import sources
from .indicators import INDICATORS

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")


def fetch_one(ind: dict, existing: dict[str, float]) -> dict[str, float]:
    src = ind["src"]
    kind = src[0]
    if kind == "dgbas":
        _, table, fld, code1, freq, label = src
        return sources.fetch_dgbas(table, fld, code1, freq, label)
    if kind == "ndc_pmi":
        return sources.fetch_ndc_pmi(src[1])
    if kind == "cbc_10y":
        return sources.fetch_cbc_10y()
    if kind == "twse_month_end":
        return sources.fetch_twse_month_end(src[1], existing, src[2])
    raise ValueError(f"unknown source {kind}")


def main(argv: list[str]) -> int:
    only = set(argv)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    status = load_json(RAW / "_status.json", {})
    failures = 0

    for ind in INDICATORS:
        iid = ind["id"]
        if only and iid not in only:
            continue
        path = RAW / f"{iid}.json"
        old = load_json(path, {})
        entry = status.get(iid, {})
        try:
            new = fetch_one(ind, old)
            if not new:
                raise sources.SourceError("empty series")
            if old and len(new) < len(old) * 0.95:
                raise sources.SourceError(f"series shrank from {len(old)} to {len(new)} points")
            save_json(path, dict(sorted(new.items())))
            entry.update(ok=True, error=None, fetched=now, last=max(new), n=len(new))
            print(f"OK   {iid:22s} {min(new)}..{max(new)} n={len(new)}", flush=True)
        except Exception as e:  # noqa: BLE001 - 任何錯誤都不應中斷其他指標
            failures += 1
            entry.update(ok=False, error=f"{type(e).__name__}: {e}", failed=now)
            print(f"FAIL {iid:22s} {e}", flush=True)
            traceback.print_exc(limit=2)
        status[iid] = entry

    if not only:
        try:
            cycles = sources.fetch_ndc_cycles()
            save_json(RAW / "_cycles.json", cycles)
            print(f"OK   {'景氣循環峰谷':22s} {len(cycles)} cycles", flush=True)
        except Exception as e:  # noqa: BLE001
            failures += 1
            print(f"FAIL cycles {e}", flush=True)

    save_json(RAW / "_status.json", status)
    print(f"done, {failures} failure(s)")
    # 全部失敗才回傳錯誤碼（通常代表網路或來源大規模異常）
    return 1 if failures and failures >= len(only or INDICATORS) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
