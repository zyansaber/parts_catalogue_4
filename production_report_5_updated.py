# -*- coding: utf-8 -*-
import pandas as pd
import requests
import pyodbc
import firebase_admin
from firebase_admin import credentials, db
import json
import hashlib
import re
from datetime import datetime

# =========================
# CONFIG
# =========================
DSN = (
    "DRIVER={HDBODBC};"
    "SERVERNODE=10.11.2.25:30241;"
    "UID=BAOJIANFENG;"
    "PWD=Xja@2025ABC;"
)

FIREBASE_URL = "https://partssr-default-rtdb.asia-southeast1.firebasedatabase.app/"
FIREBASE_JSON = "firebase-adminsdk.json"
ROOT = "production_report"

# =========================
# Firebase Init
# =========================
def init_firebase():
    if not firebase_admin._apps:
        cred = credentials.Certificate(FIREBASE_JSON)
        firebase_admin.initialize_app(cred, {
            "databaseURL": FIREBASE_URL
        })

# =========================
# Utils
# =========================
def chunk_list(lst, size=800):
    for i in range(0, len(lst), size):
        yield lst[i:i + size]

def clean_key(val):
    val = str(val).strip().upper()
    return re.sub(r"[.#$/\[\]\s]+", "_", val)

def clean_df(df):
    df = df.copy()
    df.columns = [str(c).strip().lower() for c in df.columns]
    df = df.where(pd.notnull(df), None)
    return df

def row_hash(row):
    return hashlib.md5(
        json.dumps(row, sort_keys=True, default=str).encode()
    ).hexdigest()

# =========================
# MES
# =========================
def get_chassis():
    url = "https://firebase-api-2mx9.onrender.com/api/mes-schedule"
    data = requests.get(url).json()["schedule"]

    df = pd.DataFrame(data)

    df["Chassis"] = df["Chassis"].astype(str).str.strip().str.upper()
    df["RegentProduction"] = df["RegentProduction"].fillna("").str.strip().str.lower()

    df["Is_Sea"] = df["RegentProduction"].apply(
        lambda x: True if x == "van on the sea" else False
    )

    df = df[
        ~df["RegentProduction"].isin([
            "",
            "none",
            "production commenced longtree"
        ])
    ]

    df = df[~df["Chassis"].str.startswith(("SRV", "SRM"))]

    return df[["Chassis", "Is_Sea"]].drop_duplicates()

# =========================
# SAP - Production Order
# =========================
def get_production_orders(chassis_list):
    if not chassis_list:
        return pd.DataFrame(columns=["Chassis", "ProductionOrder"])

    all_df = []

    with pyodbc.connect(DSN) as conn:
        for chunk in chunk_list(chassis_list):
            chassis_sql = ",".join([f"'{c}'" for c in chunk])

            sql = f"""
            SELECT
                objk."SERNR" AS "Chassis",
                afko."AUFNR" AS "ProductionOrder"
            FROM SAPHANADB.SER02 s2
            JOIN SAPHANADB.OBJK objk
              ON objk."OBKNR" = s2."OBKNR"
             AND objk."MANDT" = '800'
            JOIN SAPHANADB.AFPO afpo
              ON afpo."KDAUF" = s2."SDAUFNR"
             AND afpo."MANDT" = '800'
            JOIN SAPHANADB.AFKO afko
              ON afko."AUFNR" = afpo."AUFNR"
             AND afko."MANDT" = '800'
            WHERE objk."SERNR" IN ({chassis_sql})
            """

            df = pd.read_sql(sql, conn)

            if not df.empty:
                all_df.append(df)

    return pd.concat(all_df, ignore_index=True) if all_df else pd.DataFrame(
        columns=["Chassis", "ProductionOrder"]
    )

# =========================
# RESB
# =========================
def get_resb_data(po_df):
    if po_df.empty:
        return pd.DataFrame(columns=[
            "ProductionOrder", "Part", "RequiredQty", "IssuedQty", "OpenQty"
        ])

    orders = po_df["ProductionOrder"].dropna().unique().tolist()

    if not orders:
        return pd.DataFrame(columns=[
            "ProductionOrder", "Part", "RequiredQty", "IssuedQty", "OpenQty"
        ])

    all_df = []

    with pyodbc.connect(DSN) as conn:
        for chunk in chunk_list(orders):
            order_sql = ",".join([f"'{o}'" for o in chunk])

            sql = f"""
            SELECT
                r."AUFNR" AS "ProductionOrder",
                r."MATNR" AS "Part",
                r."BDMNG" AS "RequiredQty",
                r."ENMNG" AS "IssuedQty",
                r."BDMNG" - r."ENMNG" AS "OpenQty"
            FROM SAPHANADB.RESB r
            WHERE r."WERKS" = '3111'
              AND r."MANDT" = '800'
              AND r."AUFNR" IN ({order_sql})
              AND COALESCE(r."XLOEK",'') <> 'X'
            """

            df = pd.read_sql(sql, conn)

            if not df.empty:
                all_df.append(df)

    return pd.concat(all_df, ignore_index=True) if all_df else pd.DataFrame(
        columns=["ProductionOrder", "Part", "RequiredQty", "IssuedQty", "OpenQty"]
    )

# =========================
# Inventory
# =========================
def get_inventory():
    sql = """
    SELECT
        MATNR AS "Part",
        SUM(LABST) AS "StockQty"
    FROM SAPHANADB.NSDM_V_MARD
    WHERE WERKS = '3111'
      AND LGORT = '0001'
      AND MANDT = '800'
    GROUP BY MATNR
    """
    with pyodbc.connect(DSN) as conn:
        return pd.read_sql(sql, conn)

# =========================
# Open PO Details
# =========================
def get_open_po_details():
    sql = """
    SELECT
        ekpo."EBELN" AS "PO_Number",
        ekpo."EBELP" AS "PO_Item",
        ekpo."MATNR" AS "Part",
        ekko."LIFNR" AS "Vendor",
        lfa1."NAME1" AS "VendorName",
        ekko."EKGRP" AS "PurchasingGroup",
        ekko."BEDAT" AS "OrderDate",
        eket."EINDT" AS "DeliveryDate",
        eket."MENGE" AS "OrderQty",
        COALESCE(eket."WEMNG", 0) AS "ReceivedQty",
        eket."MENGE" - COALESCE(eket."WEMNG", 0) AS "OpenQty"
    FROM SAPHANADB.EKPO ekpo
    JOIN SAPHANADB.EKET eket
      ON ekpo."EBELN" = eket."EBELN"
     AND ekpo."EBELP" = eket."EBELP"
    JOIN SAPHANADB.EKKO ekko
      ON ekpo."EBELN" = ekko."EBELN"
    LEFT JOIN SAPHANADB.LFA1 lfa1
      ON ekko."LIFNR" = lfa1."LIFNR"
     AND lfa1."MANDT" = '800'
    WHERE ekpo."WERKS" = '3111'
      AND ekpo."MANDT" = '800'
      AND eket."MANDT" = '800'
      AND ekko."MANDT" = '800'
      AND ekpo."EBELN" NOT LIKE '70000%'
      AND COALESCE(ekko."LOEKZ", '') <> 'L'
      AND COALESCE(ekpo."LOEKZ", '') <> 'L'
      AND COALESCE(ekpo."ELIKZ", '') <> 'X'
      AND COALESCE(eket."MENGE", 0) > 0
      AND (eket."MENGE" - COALESCE(eket."WEMNG", 0)) > 0
    """
    with pyodbc.connect(DSN) as conn:
        return pd.read_sql(sql, conn)

# =========================
# Material Description
# =========================
def get_material_desc(parts):
    parts = list(set([str(p).strip() for p in parts if pd.notna(p) and str(p).strip()]))

    if not parts:
        return pd.DataFrame(columns=["Part", "Description"])

    all_df = []

    with pyodbc.connect(DSN) as conn:
        for chunk in chunk_list(parts):
            part_sql = ",".join([f"'{p}'" for p in chunk])

            sql = f"""
            SELECT
                makt."MATNR" AS "Part",
                makt."MAKTX" AS "Description"
            FROM SAPHANADB.MAKT makt
            WHERE makt."MANDT" = '800'
              AND makt."SPRAS" = 'E'
              AND makt."MATNR" IN ({part_sql})
            """

            df = pd.read_sql(sql, conn)

            if not df.empty:
                all_df.append(df)

    return pd.concat(all_df, ignore_index=True).drop_duplicates("Part") if all_df else pd.DataFrame(
        columns=["Part", "Description"]
    )

# =========================
# Kanban
# =========================
def get_kanban_parts():
    sql = """
    SELECT DISTINCT MATNR
    FROM SAPHANADB.PKHD
    WHERE WERKS = '3111'
      AND MANDT = '800'
    """
    with pyodbc.connect(DSN) as conn:
        df = pd.read_sql(sql, conn)

    return set(df["MATNR"].astype(str).str.strip())

def get_kanban_extra():
    sql = """
    SELECT
        marc."MATNR" AS "Part",
        marc."PLIFZ" AS "LeadTime",
        marc."EISBE" AS "SafetyStock"
    FROM SAPHANADB.MARC marc
    WHERE marc."WERKS" = '3111'
      AND marc."MANDT" = '800'
    """
    with pyodbc.connect(DSN) as conn:
        return pd.read_sql(sql, conn)

# =========================
# Build Dataset
# =========================
def build_dataset(chassis_df):
    po_df = get_production_orders(chassis_df["Chassis"].tolist())

    if po_df.empty:
        print("没有 Production Order")
        return pd.DataFrame(columns=[
            "Chassis", "ProductionOrder", "Part",
            "RequiredQty", "IssuedQty", "OpenQty", "Is_Sea"
        ])

    resb_df = get_resb_data(po_df)

    df = po_df.merge(resb_df, on="ProductionOrder", how="left")
    df = df.merge(chassis_df, on="Chassis", how="left")

    df = df[
        df["Part"].notna() &
        (df["Part"].astype(str).str.strip() != "") &
        (df["Part"].astype(str).str.lower() != "nan")
    ].copy()

    df = df[
        ~df["Part"].astype(str).str.strip().str.upper().str.startswith("D14")
    ].copy()

    return df

# =========================
# Summary
# =========================
def build_summary(df, inventory_df, open_po_df, desc_df):
    df = df.copy()
    df["Is_Sea"] = df["Is_Sea"].fillna(False)

    summary = df.groupby("Part", as_index=False).agg({
        "RequiredQty": "sum",
        "IssuedQty": "sum",
        "OpenQty": "sum"
    })

    nosea = df[df["Is_Sea"] == False].groupby("Part", as_index=False)["RequiredQty"].sum()
    nosea.rename(columns={"RequiredQty": "nosea_required_qty"}, inplace=True)

    sea = df[df["Is_Sea"] == True].groupby("Part", as_index=False)["RequiredQty"].sum()
    sea.rename(columns={"RequiredQty": "sea_required_qty"}, inplace=True)

    summary = summary.merge(nosea, on="Part", how="left")
    summary = summary.merge(sea, on="Part", how="left")

    summary["nosea_required_qty"] = summary["nosea_required_qty"].fillna(0)
    summary["sea_required_qty"] = summary["sea_required_qty"].fillna(0)

    summary = summary.merge(inventory_df, on="Part", how="left")
    summary["StockQty"] = summary["StockQty"].fillna(0)

    summary = summary.merge(desc_df, on="Part", how="left")

    kanban_parts = get_kanban_parts()
    summary["Is_Kanban"] = summary["Part"].astype(str).str.strip().apply(
        lambda x: x in kanban_parts
    )

    kanban_extra = get_kanban_extra()
    summary = summary.merge(kanban_extra, on="Part", how="left")

    po_sum = open_po_df.groupby("Part", as_index=False)["OpenQty"].sum()
    po_sum.rename(columns={"OpenQty": "OpenPOQty"}, inplace=True)

    summary = summary.merge(po_sum, on="Part", how="left")
    summary["OpenPOQty"] = summary["OpenPOQty"].fillna(0)

    summary.rename(columns={
        "RequiredQty": "total_required_qty",
        "IssuedQty": "issued_qty",
        "OpenQty": "open_qty",
        "StockQty": "stock_qty",
        "Is_Kanban": "is_kanban",
        "LeadTime": "lead_time",
        "SafetyStock": "safety_stock",
        "OpenPOQty": "open_po_qty"
    }, inplace=True)

    summary["lead_time"] = summary["lead_time"].fillna(0)
    summary["safety_stock"] = summary["safety_stock"].fillna(0)

    # Production Required 页面不需要显示 kanban 料号
    summary = summary[summary["is_kanban"] != True].copy()

    return summary

# =========================
# Firebase Format
# =========================
def to_keyed_summary(df):
    df = clean_df(df)

    result = {}
    for _, row in df.iterrows():
        d = row.to_dict()
        key = clean_key(d["part"])
        result[key] = d

    return result

def to_keyed_open_po(df):
    df = clean_df(df)

    result = {}
    for _, row in df.iterrows():
        d = row.to_dict()
        key = f"{clean_key(d['po_number'])}_{clean_key(d['po_item'])}"
        result[key] = d

    return result

# =========================
# Firebase Write
# =========================
def overwrite_table(name, records):
    ref = db.reference(f"{ROOT}/{name}")

    ref.set({
        "items": records,
        "meta": {
            "updated": datetime.now().isoformat(),
            "count": len(records)
        }
    })

    print(f"完成全量更新: {name}, rows={len(records)}")

def update_table(name, records):
    ref = db.reference(f"{ROOT}/{name}")

    old_hash = ref.child("hash").get() or {}
    new_hash = {
        key: row_hash(value)
        for key, value in records.items()
    }

    updates = {}

    changed_count = 0
    deleted_count = 0

    for key, value in records.items():
        if old_hash.get(key) != new_hash[key]:
            updates[f"items/{key}"] = value
            updates[f"hash/{key}"] = new_hash[key]
            changed_count += 1

    for key in old_hash:
        if key not in new_hash:
            updates[f"items/{key}"] = None
            updates[f"hash/{key}"] = None
            deleted_count += 1

    updates["meta/updated"] = datetime.now().isoformat()
    updates["meta/count"] = len(records)
    updates["meta/changed_count"] = changed_count
    updates["meta/deleted_count"] = deleted_count

    items = list(updates.items())

    for i in range(0, len(items), 300):
        ref.update(dict(items[i:i + 300]))

    print(
        f"完成增量更新: {name}, total={len(records)}, "
        f"changed={changed_count}, deleted={deleted_count}"
    )

# =========================
# Upload
# =========================
def upload(df):
    print("获取 Inventory...")
    inventory_df = get_inventory()

    print("获取 Open PO...")
    open_po_df = get_open_po_details()

    open_po_df = open_po_df[
        ~open_po_df["Part"].astype(str).str.strip().str.upper().str.startswith("D14")
    ].copy()

    print("获取物料描述...")
    all_parts = set(df["Part"].dropna().astype(str).str.strip()) | set(
        open_po_df["Part"].dropna().astype(str).str.strip()
    )
    desc_df = get_material_desc(all_parts)

    print("生成 Summary...")
    summary_df = build_summary(df, inventory_df, open_po_df, desc_df)

    print("合并 Open PO 物料描述...")
    open_po_df = open_po_df.merge(desc_df, on="Part", how="left")

    print("上传 Summary 全量...")
    overwrite_table("summary", to_keyed_summary(summary_df))

    print("上传 Open PO 增量...")
    update_table("open_po", to_keyed_open_po(open_po_df))

# =========================
# MAIN
# =========================
def main():
    init_firebase()

    print("获取 MES...")
    chassis_df = get_chassis()

    if chassis_df.empty:
        print("没有 MES 数据")
        return

    print("构建生产需求数据...")
    df = build_dataset(chassis_df)

    if df.empty:
        print("没有生产需求数据")
        return

    print("上传 Firebase...")
    upload(df)

    print("完成")

if __name__ == "__main__":
    main()
