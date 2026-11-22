"""把 data/raw/ 的原始序列轉成網站使用的 site/data/data.json。

用法： python -m pipeline.build

轉換規則
- 月轉季：只計算三個月都到齊的完整季度，依指標 agg 取平均、加總或期末值。
- 年增率：與去年同期比較（月資料比 12 個月前，季資料比 4 季前）。
- 每筆輸出為 [期間, 數值, 年增率]；缺少去年同期時年增率為 null。
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from .indicators import CATEGORIES, COMPARISONS, INDICATORS, OVERVIEW, REFERENCE

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "site" / "data" / "data.json"

SOURCE_LABELS = {
    "dgbas": "行政院主計總處 總體統計資料庫",
    "ndc_pmi": "國家發展委員會 臺灣採購經理人指數",
    "cbc_10y": "中央銀行 資本市場利率",
    "twse_month_end": "臺灣證券交易所 每日收盤行情",
}


def load(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def month_to_quarter(p: str) -> str:
    y, m = p.split("-")
    return f"{y}-Q{(int(m) - 1) // 3 + 1}"


def to_quarterly(monthly: dict[str, float], agg: str) -> dict[str, float]:
    groups: dict[str, list[tuple[str, float]]] = {}
    for p in sorted(monthly):
        groups.setdefault(month_to_quarter(p), []).append((p, monthly[p]))
    out = {}
    for q, items in groups.items():
        if len(items) != 3:  # 未滿三個月的季度不計算
            continue
        vals = [v for _, v in items]
        if agg == "mean":
            out[q] = sum(vals) / 3
        elif agg == "sum":
            out[q] = sum(vals)
        elif agg == "last":
            out[q] = vals[-1]
        else:
            raise ValueError(agg)
    return out


def shift(p: str, years: int = -1) -> str:
    y, rest = p.split("-", 1)
    return f"{int(y) + years:04d}-{rest}"


def with_yoy(series: dict[str, float], head: str) -> list[list]:
    """head 為 level 的指標（比率、分數、利率）不計算年增率。"""
    rows = []
    for p in sorted(series):
        v = series[p]
        prev = series.get(shift(p))
        yoy = None
        # 流量為負值（如買賣超）或去年同期為 0 時，年增率沒有意義
        if head == "yoy" and prev is not None and prev > 0 and v >= 0:
            yoy = round((v / prev - 1) * 100, 2)
        rows.append([p, round(v, 4), yoy])
    return rows


def recessions(cycles: list[dict]) -> tuple[list[list[str]], list[dict]]:
    """回傳已認定的收縮期 [高峰, 谷底] 及完整循環表。"""
    spans = [[c["peak"], c["trough2"]] for c in cycles if c.get("peak") and c.get("trough2")]
    return spans, cycles


def main() -> None:
    status = load(RAW / "_status.json", {})
    cycles = load(RAW / "_cycles.json", [])
    spans, cycle_table = recessions(cycles)

    out_inds = {}
    for ind in INDICATORS:
        raw = load(RAW / f"{ind['id']}.json", {})
        if not raw:
            print(f"skip {ind['id']}: no raw data")
            continue
        native_q = "-Q" in next(iter(raw))
        monthly = None if native_q else raw
        quarterly = raw if native_q else to_quarterly(raw, ind["agg"])
        st = status.get(ind["id"], {})
        out_inds[ind["id"]] = {
            "name": ind["name"],
            "cats": ind["cats"],
            "unit": ind["unit"],
            "agg": ind["agg"],
            "head": ind["head"],
            "desc": ind["desc"],
            "ref": REFERENCE.get(ind["id"], ""),
            "source": SOURCE_LABELS[ind["src"][0]],
            "freq": "Q" if native_q else "M",
            "m": with_yoy(monthly, ind["head"]) if monthly else None,
            "q": with_yoy(quarterly, ind["head"]),
            "status": {
                "ok": st.get("ok", True),
                "error": st.get("error"),
                "fetched": st.get("fetched"),
            },
        }

    data = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "categories": [{"id": c, "name": n} for c, n in CATEGORIES],
        "overview": [i for i in OVERVIEW if i in out_inds],
        "comparisons": COMPARISONS,
        "recessions": spans,
        "cycles": cycle_table,
        "indicators": out_inds,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(out_inds)} indicators, {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
