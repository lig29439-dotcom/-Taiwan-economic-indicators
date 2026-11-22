"""指標定義。新增或調整指標只需要改這個檔案。

欄位說明
  id     唯一代碼（網址與檔名使用）
  name   顯示名稱
  cats   所屬分類（可多個，例如電子產品外銷訂單同時屬於「產業」與「半導體」）
  unit   原始數值單位
  src    資料來源：
           ("dgbas", 資料表, 指標代碼, 第二維代碼或 None, 頻率 M/Q, 欄位名稱核對字串)
           ("ndc_pmi", 欄位)            國發會 PMI/NMI
           ("cbc_10y",)                 央行十年期公債次級市場利率
           ("twse_month_end", 指數名稱, 起始月)
  agg    月轉季方式：mean 平均（比率、指數）、sum 加總（流量）、last 期末值（存量、股價）
  head   主要觀察值：level 直接看數值；yoy 看年增率
  desc   閱讀方式
"""

CATEGORIES = [
    ("cycle", "景氣"),
    ("industry", "產業"),
    ("semi", "半導體"),
    ("realestate", "房地產"),
    ("prices", "物價"),
    ("money", "金融"),
    ("labor", "勞動"),
    ("stock", "股市"),
]

INDICATORS = [
    # ------------------------------------------------------------ 景氣
    dict(id="gdp_growth", name="經濟成長率", cats=["cycle"], unit="%", agg="mean", head="level",
         src=("dgbas", "A018101010", "3", None, "Q", "經濟成長率"),
         desc="實質 GDP 年增率，衡量整體經濟擴張速度。台灣長期平均約 3%。"),
    dict(id="gdp_c_domestic", name="GDP 貢獻：國內需求", cats=["cycle"], unit="百分點", agg="mean", head="level",
         src=("dgbas", "A018102070", "2", None, "Q", "國內需求-小計"),
         desc="經濟成長率中來自民間消費、投資、政府支出的部分。"),
    dict(id="gdp_c_consumption", name="GDP 貢獻：民間消費", cats=["cycle"], unit="百分點", agg="mean", head="level",
         src=("dgbas", "A018102070", "3", None, "Q", "民間消費"),
         desc="民間消費對經濟成長率的貢獻，反映內需動能。"),
    dict(id="gdp_c_investment", name="GDP 貢獻：固定投資", cats=["cycle"], unit="百分點", agg="mean", head="level",
         src=("dgbas", "A018102070", "5", None, "Q", "固定資本形成"),
         desc="固定資本形成（廠房、設備、營建）對經濟成長率的貢獻，反映企業擴產意願。"),
    dict(id="gdp_c_external", name="GDP 貢獻：國外淨需求", cats=["cycle"], unit="百分點", agg="mean", head="level",
         src=("dgbas", "A018102070", "10", None, "Q", "國外淨需求-小計"),
         desc="輸出減輸入對經濟成長率的貢獻，反映外需動能。"),
    dict(id="signal_score", name="景氣對策信號", cats=["cycle"], unit="分", agg="mean", head="level",
         src=("dgbas", "A120101010", "5", None, "M", "景氣對策信號"),
         desc="國發會景氣燈號分數：9–16 藍燈（低迷）、17–22 黃藍燈、23–31 綠燈（穩定）、32–37 黃紅燈、38–45 紅燈（熱絡）。"),
    dict(id="leading_dt", name="領先指標（不含趨勢）", cats=["cycle"], unit="點", agg="mean", head="level",
         src=("dgbas", "A120101010", "2", None, "M", "領先指標不含趨勢"),
         desc="預測未來景氣方向。高於 100 代表高於長期趨勢；連續上升代表景氣將轉好。"),
    dict(id="coincident_dt", name="同時指標（不含趨勢）", cats=["cycle"], unit="點", agg="mean", head="level",
         src=("dgbas", "A120101010", "4", None, "M", "同時指標不含趨勢"),
         desc="反映當前景氣位置。高於 100 代表目前景氣高於長期趨勢。"),
    dict(id="pmi", name="製造業 PMI", cats=["cycle", "industry"], unit="%", agg="mean", head="level",
         src=("ndc_pmi", "PMI"),
         desc="採購經理人指數，50 以上代表製造業擴張、以下代表緊縮。領先性高，2012 年 7 月起編製。"),
    dict(id="nmi", name="非製造業 NMI", cats=["cycle"], unit="%", agg="mean", head="level",
         src=("ndc_pmi", "NMI"),
         desc="非製造業經理人指數，50 以上代表服務業擴張。"),

    # ------------------------------------------------------------ 產業
    dict(id="ip_total", name="工業生產指數", cats=["industry"], unit="指數(2021=100)", agg="mean", head="yoy",
         src=("dgbas", "A050104010", "1", None, "M", "總指數"),
         desc="工業（礦業、製造業、水電燃氣）整體產出，看年增率判斷生產動能。"),
    dict(id="ip_mfg", name="製造業生產指數", cats=["industry"], unit="指數(2021=100)", agg="mean", head="yoy",
         src=("dgbas", "A050104010", "4", None, "M", "製造業"),
         desc="製造業產出年增率。"),
    dict(id="ip_ict", name="資訊電子工業生產", cats=["industry", "semi"], unit="指數(2021=100)", agg="mean", head="yoy",
         src=("dgbas", "A050104010", "6", None, "M", "資訊電子工業"),
         desc="涵蓋半導體、電子零組件、電腦及光學產品，是半導體生產最接近的官方指標。"),
    dict(id="ip_metal", name="金屬機電工業生產", cats=["industry"], unit="指數(2021=100)", agg="mean", head="yoy",
         src=("dgbas", "A050104010", "5", None, "M", "金屬機電工業"),
         desc="鋼鐵、金屬製品、機械、汽車等產出。"),
    dict(id="ip_chem", name="化學工業生產", cats=["industry"], unit="指數(2021=100)", agg="mean", head="yoy",
         src=("dgbas", "A050104010", "7", None, "M", "化學工業"),
         desc="石化、塑膠、化學材料等產出。"),
    dict(id="ip_consumer", name="民生工業生產", cats=["industry"], unit="指數(2021=100)", agg="mean", head="yoy",
         src=("dgbas", "A050104010", "8", None, "M", "民生工業"),
         desc="食品、紡織、成衣等民生產業產出。"),
    dict(id="orders_total", name="外銷訂單", cats=["industry"], unit="百萬美元", agg="sum", head="yoy",
         src=("dgbas", "A050106010", "2", "1", "M", "美金計價(百萬美元)/合計"),
         desc="廠商接到的海外訂單金額，領先實際出口約 1–3 個月。"),
    dict(id="orders_electronic", name="外銷訂單：電子產品", cats=["industry", "semi"], unit="百萬美元", agg="sum", head="yoy",
         src=("dgbas", "A050106010", "2", "6", "M", "電子產品"),
         desc="以半導體、電子零組件為主的外銷訂單。"),
    dict(id="orders_ict", name="外銷訂單：資通產品", cats=["industry", "semi"], unit="百萬美元", agg="sum", head="yoy",
         src=("dgbas", "A050106010", "2", "9", "M", "資訊與通信產品"),
         desc="伺服器、電腦、網通設備等外銷訂單。"),
    dict(id="orders_metal", name="外銷訂單：基本金屬", cats=["industry"], unit="百萬美元", agg="sum", head="yoy",
         src=("dgbas", "A050106010", "2", "5", "M", "基本金屬"), desc="鋼鐵、金屬製品外銷訂單。"),
    dict(id="orders_plastic", name="外銷訂單：塑橡膠", cats=["industry"], unit="百萬美元", agg="sum", head="yoy",
         src=("dgbas", "A050106010", "2", "3", "M", "塑膠"), desc="塑膠、橡膠及其製品外銷訂單。"),
    dict(id="orders_chem", name="外銷訂單：化學品", cats=["industry"], unit="百萬美元", agg="sum", head="yoy",
         src=("dgbas", "A050106010", "2", "2", "M", "化學品"), desc="化學品外銷訂單。"),
    dict(id="orders_machine", name="外銷訂單：機械", cats=["industry"], unit="百萬美元", agg="sum", head="yoy",
         src=("dgbas", "A050106010", "2", "7", "M", "機械"), desc="機械外銷訂單，反映全球資本支出。"),
    dict(id="orders_optical", name="外銷訂單：光學器材", cats=["industry"], unit="百萬美元", agg="sum", head="yoy",
         src=("dgbas", "A050106010", "2", "11", "M", "光學器材"), desc="面板、光學器材外銷訂單。"),
    dict(id="orders_us", name="外銷訂單：美國", cats=["industry"], unit="百萬美元", agg="sum", head="yoy",
         src=("dgbas", "A050105010", "2", "2", "M", "美國"), desc="來自美國的外銷訂單。"),
    dict(id="orders_china", name="外銷訂單：中國大陸", cats=["industry"], unit="百萬美元", agg="sum", head="yoy",
         src=("dgbas", "A050105010", "2", "3", "M", "中國大陸"), desc="來自中國大陸（含香港）的外銷訂單。"),
    dict(id="orders_europe", name="外銷訂單：歐洲", cats=["industry"], unit="百萬美元", agg="sum", head="yoy",
         src=("dgbas", "A050105010", "2", "4", "M", "歐洲"), desc="來自歐洲的外銷訂單。"),
    dict(id="orders_japan", name="外銷訂單：日本", cats=["industry"], unit="百萬美元", agg="sum", head="yoy",
         src=("dgbas", "A050105010", "2", "5", "M", "日本"), desc="來自日本的外銷訂單。"),
    dict(id="orders_asean", name="外銷訂單：東協", cats=["industry"], unit="百萬美元", agg="sum", head="yoy",
         src=("dgbas", "A050105010", "2", "6", "M", "東協"), desc="來自東協六國的外銷訂單。"),
    dict(id="exports", name="出口總值", cats=["industry"], unit="百萬美元", agg="sum", head="yoy",
         src=("dgbas", "A081201010", "2", "1", "M", "USD(百萬美元)/出口"),
         desc="海關出口金額（美元），台灣經濟最重要的動能來源。"),
    dict(id="imports", name="進口總值", cats=["industry"], unit="百萬美元", agg="sum", head="yoy",
         src=("dgbas", "A081201010", "2", "2", "M", "USD(百萬美元)/進口"),
         desc="海關進口金額（美元）。資本設備與原物料進口增加通常代表廠商擴產。"),
    dict(id="retail", name="零售業營業額", cats=["industry"], unit="百萬元", agg="sum", head="yoy",
         src=("dgbas", "A050107020", "3", None, "M", "零售業"), desc="零售業營業額年增率，反映民間消費。"),
    dict(id="restaurant", name="餐飲業營業額", cats=["industry"], unit="百萬元", agg="sum", head="yoy",
         src=("dgbas", "A050107020", "4", None, "M", "餐飲業"), desc="餐飲業營業額年增率。"),

    # ------------------------------------------------------------ 半導體（另含上方標記 semi 的指標）
    dict(id="semi_index", name="半導體類股指數", cats=["semi", "stock"], unit="點", agg="last", head="yoy",
         src=("twse_month_end", "半導體類指數", "2007-07"),
         desc="證交所半導體類股價指數（月底收盤），反映市場對半導體景氣的預期。2007 年 7 月起編製。"),
    dict(id="ppi_semi", name="生產者物價：半導體", cats=["semi", "prices"], unit="指數(2021=100)", agg="mean", head="yoy",
         src=("dgbas", "A030701015", "68", None, "M", "半導體"),
         desc="半導體產品出廠價格，上漲代表供需偏緊、議價力強。2021 年起編製。"),

    # ------------------------------------------------------------ 房地產
    dict(id="permit_res", name="住宅建照樓地板面積", cats=["realestate"], unit="平方公尺", agg="sum", head="yoy",
         src=("dgbas", "A060101010", "10", None, "M", "住宅(H-2)"),
         desc="核發住宅建造執照的面積，代表建商推案意願，是房市的領先指標。"),
    dict(id="occupancy_res", name="住宅使照樓地板面積", cats=["realestate"], unit="平方公尺", agg="sum", head="yoy",
         src=("dgbas", "A060103010", "10", None, "M", "住宅(H-2)"),
         desc="核發住宅使用執照的面積，代表完工交屋量（未來住宅供給）。"),
    dict(id="mortgage", name="購置住宅貸款餘額", cats=["realestate", "money"], unit="百萬元", agg="last", head="yoy",
         src=("dgbas", "A091901010", "2", None, "M", "購置住宅貸款"),
         desc="全體銀行房貸餘額年增率，反映購屋需求與信用擴張；央行選擇性信用管制會影響此指標。"),
    dict(id="construction_loan", name="建築貸款餘額", cats=["realestate", "money"], unit="百萬元", agg="last", head="yoy",
         src=("dgbas", "A091901010", "8", None, "M", "建築貸款"),
         desc="建商購地與營建貸款餘額年增率，反映建商擴張力道。"),
    dict(id="construction_cost", name="營造工程物價指數", cats=["realestate", "prices"], unit="指數(2021=100)", agg="mean", head="yoy",
         src=("dgbas", "A030501015", "1", None, "M", "營造工程總指數"),
         desc="營建材料與工資成本，影響新屋成本與房價。"),

    # ------------------------------------------------------------ 物價
    dict(id="cpi", name="消費者物價指數", cats=["prices"], unit="指數(2021=100)", agg="mean", head="yoy",
         src=("dgbas", "A030601015", "1", None, "M", "消費者物價總指數_未經季節調整"),
         desc="CPI 年增率即通膨率，央行目標約 2%。"),
    dict(id="core_cpi", name="核心 CPI", cats=["prices"], unit="指數(2021=100)", agg="mean", head="yoy",
         src=("dgbas", "A030601015", "3", None, "M", "核心物價】_未經季節調整"),
         desc="不含蔬果及能源的 CPI，較能反映長期通膨趨勢。"),
    dict(id="ppi", name="生產者物價指數", cats=["prices"], unit="指數(2021=100)", agg="mean", head="yoy",
         src=("dgbas", "A030701015", "1", None, "M", "總指數"),
         desc="廠商出廠價格，領先 CPI。2021 年起編製（取代躉售物價指數）。"),
    dict(id="import_price", name="進口物價（新台幣）", cats=["prices"], unit="指數(2021=100)", agg="mean", head="yoy",
         src=("dgbas", "A030601015", "5", None, "M", "進口物價總指數_新臺幣計價_未經"),
         desc="進口原物料與商品價格，是國內物價的上游壓力來源。"),

    # ------------------------------------------------------------ 金融
    dict(id="m1b", name="M1B 貨幣供給", cats=["money"], unit="百萬元", agg="mean", head="yoy",
         src=("dgbas", "A090501010", "1", "14", "M", "日平均數/貨幣總計數-M1B"),
         desc="活存與支存等可隨時動用的資金。年增率上升、且高於 M2（黃金交叉）通常代表資金流向股市。"),
    dict(id="m2", name="M2 貨幣供給", cats=["money"], unit="百萬元", agg="mean", head="yoy",
         src=("dgbas", "A090501010", "1", "15", "M", "日平均數/貨幣總計數-M2"),
         desc="廣義貨幣，央行參考區間約 2.5%–6.5%。"),
    dict(id="overnight", name="金融業隔夜拆款利率", cats=["money"], unit="%", agg="mean", head="level",
         src=("dgbas", "A093005010", "1", "1", "M", "加權平均/隔夜"),
         desc="銀行間短期資金價格，隨央行政策利率變動。"),
    dict(id="bond10y", name="10 年期公債殖利率", cats=["money", "stock"], unit="%", agg="mean", head="level",
         src=("cbc_10y",),
         desc="長期利率基準，影響房貸利率與股市評價。"),
    dict(id="usdtwd", name="美元兌新台幣", cats=["money"], unit="新台幣元", agg="mean", head="level",
         src=("dgbas", "A093201010", "4", None, "M", "銀行間收盤匯率-日平均"),
         desc="數值上升代表新台幣貶值。新台幣升值通常伴隨外資匯入。"),

    # ------------------------------------------------------------ 勞動
    dict(id="unemployment", name="失業率", cats=["labor"], unit="%", agg="mean", head="level",
         src=("dgbas", "A040107010", "12", "1", "M", "失業率(%)/合計"),
         desc="落後指標，景氣轉差後才會上升。"),
    dict(id="employment", name="就業人數", cats=["labor"], unit="千人", agg="mean", head="yoy",
         src=("dgbas", "A040107010", "4", "1", "M", "就業人數(千人)/合計"), desc="就業人數年增率。"),
    dict(id="wage", name="經常性薪資", cats=["labor"], unit="元", agg="mean", head="yoy",
         src=("dgbas", "A046301010", "1", "1", "M", "工業及服務業/合計"),
         desc="工業及服務業每人每月經常性薪資年增率，扣除 CPI 年增率即實質薪資成長。"),

    # ------------------------------------------------------------ 股市
    dict(id="taiex", name="加權指數", cats=["stock"], unit="點", agg="last", head="yoy",
         src=("dgbas", "A110404010", "1", None, "M", "臺灣加權指數"), desc="集中市場加權股價指數（月底）。"),
    dict(id="otc", name="櫃買指數", cats=["stock"], unit="點", agg="last", head="yoy",
         src=("dgbas", "A110404010", "2", None, "M", "櫃買市場股價指數"), desc="櫃買市場股價指數（月底），中小型股代表。"),
    dict(id="pe", name="上市股票本益比", cats=["stock"], unit="倍", agg="last", head="level",
         src=("dgbas", "A110401010", "4", None, "M", "本益比"),
         desc="整體市場股價相對獲利的倍數，越高代表評價越貴。適合與歷史分位數比較。"),
    dict(id="eps", name="上市股票平均每股盈餘", cats=["stock"], unit="元", agg="last", head="yoy",
         src=("dgbas", "A110401010", "2", None, "M", "平均每股盈餘"), desc="上市公司整體獲利水準。"),
    dict(id="foreign_net", name="外資買賣超", cats=["stock"], unit="十億元", agg="sum", head="level",
         src=("dgbas", "A110210010", "1", "3", "M", "累計買賣超金額 (新臺幣十億元)/外資"),
         desc="外資在集中市場的買賣超金額，正值為買超。"),
    dict(id="trust_net", name="投信買賣超", cats=["stock"], unit="十億元", agg="sum", head="level",
         src=("dgbas", "A110210010", "1", "1", "M", "累計買賣超金額 (新臺幣十億元)/投信"),
         desc="投信在集中市場的買賣超金額，正值為買超。"),
]

# 總覽頁的關鍵指標卡片（依序顯示）
OVERVIEW = ["gdp_growth", "signal_score", "pmi", "orders_total", "exports", "ip_mfg",
            "cpi", "unemployment", "taiex", "pe", "bond10y", "m1b"]

# 產業比較圖
COMPARISONS = [
    dict(id="orders_goods", title="外銷訂單年增率：依貨品",
         items=["orders_electronic", "orders_ict", "orders_optical", "orders_machine",
                "orders_metal", "orders_plastic", "orders_chem"]),
    dict(id="orders_region", title="外銷訂單年增率：依地區",
         items=["orders_us", "orders_china", "orders_europe", "orders_japan", "orders_asean"]),
    dict(id="ip_industry", title="工業生產年增率：依產業",
         items=["ip_ict", "ip_metal", "ip_chem", "ip_consumer"]),
]
