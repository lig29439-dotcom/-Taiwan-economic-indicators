"""各資料來源的抓取函式。

每個函式回傳 {期間: 數值}，期間格式：
  月資料 "YYYY-MM"，季資料 "YYYY-Qn"。

只使用 Python 標準函式庫，GitHub Actions 不需另外安裝套件。
"""

from __future__ import annotations

import calendar
import csv
import io
import json
import time
import urllib.error
import urllib.request
from datetime import date, timedelta

UA = "Mozilla/5.0 (compatible; tw-econ-indicators/1.0)"
DGBAS_BASE = "https://nstatdb.dgbas.gov.tw/dgbasall/webMain.aspx?sdmx/"
NDC_PMI_URL = (
    "https://ws.ndc.gov.tw/Download.ashx?u=LzAwMS9hZG1pbmlzdHJhdG9yLzEwL3JlbGZpbGUvNTc4MS82MzkxL2Jm"
    "OGE0ZWI3LTEwZmUtNGZhMC1iNjQ2LTMwZTg5MGQwMjE4YS5jc3Y%3d&n=6Ie654Gj5o6h6LO857aT55CG5Lq65oyH5pW4KHBtaeWPim5taSkuY3N2&icon=.csv"
)
NDC_CYCLES_URL = (
    "https://ws.ndc.gov.tw/Download.ashx?u=LzAwMS9hZG1pbmlzdHJhdG9yLzEwL3JlbGZpbGUvMC85ODYyL2VkNWU3NDAw"
    "LTM3OGYtNDA3YS05NmZhLWQ2ZGJkMjI0MzJkMS5jc3Y%3d&n=5Y%2bw54Gj5q235qyh5pmv5rCj5b6q55Kw5bOw6LC35pel5pyfLmNzdg%3d%3d&icon=..csv"
)
CBC_CAPITAL_RATES_URL = (
    "https://www.cbc.gov.tw/public/data/OpenData/%E7%B6%93%E7%A0%94%E8%99%95/EG43M01.csv"
)
TWSE_MI_INDEX = "https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date={d}&type=IND"


class SourceError(RuntimeError):
    pass


def http_get(url: str, *, tries: int = 4, timeout: int = 120, expect: bytes | None = None) -> bytes:
    """帶重試的 GET。政府網站偶爾回空內容或連線中斷，採遞增等待重試。"""
    last = ""
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            raw = urllib.request.urlopen(req, timeout=timeout).read()
            if raw.strip() and (expect is None or raw.lstrip().startswith(expect)):
                return raw
            last = f"unexpected body: {raw[:80]!r}"
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            last = repr(e)
        time.sleep(3 * (i + 1))
    raise SourceError(f"GET failed after {tries} tries: {url} ({last})")


def decode_text(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp950", "big5"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    raise SourceError("cannot decode text")


def to_period(sdmx_id: str) -> str | None:
    """'2026-M9' -> '2026-09'；'2026-Q2' -> '2026-Q2'；年資料回傳 None。"""
    if "-M" in sdmx_id:
        y, m = sdmx_id.split("-M")
        return f"{int(y):04d}-{int(m):02d}"
    if "-Q" in sdmx_id:
        return sdmx_id
    return None


def strip_trailing_zeros(series: dict[str, float]) -> dict[str, float]:
    """主計總處 API 對尚未發布的期間回傳 0。只去掉最後一個非零值之後的 0，中間的 0 保留（可能是真實數值）。"""
    keys = sorted(series)
    while keys and series[keys[-1]] == 0:
        keys.pop()
    return {k: series[k] for k in keys}


# ---------------------------------------------------------------- 主計總處 SDMX

_dgbas_meta_cache: dict[str, dict] = {}


def dgbas_meta(table: str) -> dict:
    if table not in _dgbas_meta_cache:
        raw = http_get(f"{DGBAS_BASE}{table}/all", expect=b"{")
        _dgbas_meta_cache[table] = json.loads(raw)["data"]["structure"]
        time.sleep(1)
    return _dgbas_meta_cache[table]


def dgbas_label(table: str, fld: str, code1: str | None) -> str:
    dims = dgbas_meta(table)["dimensions"]["series"]
    names = []
    for dim, val in zip(dims, [fld, code1]):
        if val is None:
            continue
        match = [v["name"] for v in dim["values"] if v["id"] == val]
        if not match:
            raise SourceError(f"{table}: id {val} not found in dimension {dim['name']}")
        names.append(match[0])
    return "/".join(names)


def fetch_dgbas(table: str, fld: str, code1: str | None, freq: str, expect_label: str,
                start_year: int = 2000) -> dict[str, float]:
    """抓一個主計總處序列。

    API 怪癖：兩個維度同時多選時 series 編號會錯置，所以每次只查一個序列。
    expect_label 用來核對欄位名稱，避免主計總處調整代碼後抓錯資料。
    """
    label = dgbas_label(table, fld, code1)
    if expect_label not in label:
        raise SourceError(f"{table} {fld}/{code1}: label '{label}' does not contain '{expect_label}'")
    key = f"{fld}.{code1 or '1'}.1.{freq}."
    end_year = date.today().year + 1
    if freq == "M":
        rng = f"&startTime={start_year}-M1&endTime={end_year}-M12"
    else:
        rng = f"&startTime={start_year}-Q1&endTime={end_year}-Q4"
    raw = http_get(f"{DGBAS_BASE}{table}/{key}{rng}", expect=b"{")
    data = json.loads(raw)["data"]
    periods = [v["id"] for v in data["structure"]["dimensions"]["observation"][0]["values"]]
    series = data["dataSets"][0]["series"]
    if len(series) != 1:
        raise SourceError(f"{table}: expected 1 series, got {len(series)}")
    obs = next(iter(series.values()))["observations"]
    out: dict[str, float] = {}
    for idx, val in obs.items():
        p = to_period(periods[int(idx)])
        v = val[0]
        if p is None or v is None or v == "":
            continue
        out[p] = float(v)
    time.sleep(1)
    return strip_trailing_zeros(out)


# ---------------------------------------------------------------- 國發會 PMI / NMI

def fetch_ndc_pmi(column: str) -> dict[str, float]:
    text = decode_text(http_get(NDC_PMI_URL))
    out: dict[str, float] = {}
    for row in csv.DictReader(io.StringIO(text)):
        d = (row.get("Date") or "").strip()
        v = (row.get(column) or "").strip()
        if len(d) != 6 or v in ("", "-"):
            continue
        out[f"{d[:4]}-{d[4:]}"] = float(v)
    if not out:
        raise SourceError(f"NDC PMI: column {column} empty")
    return out


# ---------------------------------------------------------------- 國發會景氣循環峰谷

def fetch_ndc_cycles() -> list[dict]:
    """回傳 [{'n': '第15循環', 'trough1': '2016-02', 'peak': '2022-01', 'trough2': None}, ...]"""
    text = decode_text(http_get(NDC_CYCLES_URL))
    rows = list(csv.reader(io.StringIO(text)))
    out = []

    def ym(s: str) -> str | None:
        s = s.strip()
        return f"{s[:4]}-{s[4:6]}" if len(s) == 6 and s.isdigit() else None

    for r in rows[1:]:
        if not r or "循環" not in r[0]:
            continue
        out.append({"n": r[0].strip(), "trough1": ym(r[1]), "peak": ym(r[2]), "trough2": ym(r[3])})
    if len(out) < 10:
        raise SourceError("NDC cycles: too few rows")
    return out


# ---------------------------------------------------------------- 央行 10 年期公債殖利率

def fetch_cbc_10y() -> dict[str, float]:
    text = decode_text(http_get(CBC_CAPITAL_RATES_URL))
    rows = list(csv.reader(io.StringIO(text)))
    header = rows[0]
    col = next((i for i, h in enumerate(header) if "十年期政府公債次級市場" in h), None)
    if col is None:
        raise SourceError("CBC: 10Y secondary market column not found")
    out: dict[str, float] = {}
    for r in rows[1:]:
        if len(r) <= col or "M" not in r[0]:
            continue
        v = r[col].strip()
        if v in ("", "-"):
            continue
        y, m = r[0].split("M")
        out[f"{int(y):04d}-{int(m):02d}"] = float(v)
    return out


# ---------------------------------------------------------------- 證交所類股指數（月底收盤）

class TwseBlocked(SourceError):
    pass


def _twse_close_on(d: date, index_name: str) -> float | None:
    """回傳該日收盤；非交易日回傳 None；被證交所限流（307 或空內容）時丟出 TwseBlocked。"""
    url = TWSE_MI_INDEX.format(d=d.strftime("%Y%m%d"))
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        raw = urllib.request.urlopen(req, timeout=60).read()
    except urllib.error.HTTPError as e:
        raise TwseBlocked(f"TWSE HTTP {e.code} for {d}") from e
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
        raise TwseBlocked(f"TWSE network error for {d}: {e!r}") from e
    if not raw.lstrip().startswith(b"{"):
        raise TwseBlocked(f"TWSE non-JSON response for {d}")
    data = json.loads(raw)
    if data.get("stat") != "OK":
        return None
    for table in data.get("tables", []):
        for row in table.get("data", []):
            if row and row[0].strip() == index_name:
                return float(row[1].replace(",", ""))
    return None


def fetch_twse_month_end(index_name: str, existing: dict[str, float], start: str,
                         refresh_last: int = 2, max_months: int = 300) -> dict[str, float]:
    """逐月抓月底最後交易日收盤，存成月資料。

    - 已有的月份沿用快取，只抓最近 refresh_last 個月與缺漏月份。
    - 由新到舊抓，每次執行最多處理 max_months 個缺漏月份，歷史資料分多次執行逐步補齊。
    - 證交所對頻繁請求會暫時封鎖 IP，請求間隔 6 秒；一旦被封鎖就停止，保留已抓到的部分。
    """
    out = dict(existing)
    pending: list[tuple[int, int]] = []
    today = date.today()
    y, m = map(int, start.split("-"))
    months = []
    while (y, m) < (today.year, today.month):  # 只取已結束的月份
        months.append((y, m))
        m += 1
        if m == 13:
            y, m = y + 1, 1
    recent = {f"{a:04d}-{b:02d}" for a, b in months[-refresh_last:]}
    for y, m in reversed(months):
        key = f"{y:04d}-{m:02d}"
        if key not in out or key in recent:
            pending.append((y, m))
    blocked = None
    for y, m in pending[:max_months]:
        d = date(y, m, calendar.monthrange(y, m)[1])
        val = None
        try:
            for _ in range(10):  # 往前找最後一個交易日（春節可能連休 9 天）
                if d.month != m:
                    break
                if d.weekday() < 5:
                    val = _twse_close_on(d, index_name)
                    time.sleep(6)
                    if val is not None:
                        break
                d -= timedelta(days=1)
        except TwseBlocked as e:
            blocked = e
            break
        if val is not None:
            out[f"{y:04d}-{m:02d}"] = val
    if blocked and out == existing:
        raise blocked  # 一筆都沒抓到才算失敗；部分成功則保留進度
    return out
