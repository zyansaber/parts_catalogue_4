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
    "SERVERNODE=xxxx;"
    "UID=xxx;"
    "PWD=xxxx;"
)

FIREBASE_URL = "https://partssr-default-rtdb.asia-southeast1.firebasedatabase.app/"
FIREBASE_JSON = "firebase-adminsdk.json"
ROOT = "production_report"

# =========================
# Firebase Init
# =========================
def init_firebase():
    cred = credentials.Certificate(FIREBASE_JSON)
    firebase_admin.initialize_app(cred, {
        "databaseURL": FIREBASE_URL
    })

# =========================
# Utils
# =========================
def chunk_list(lst, size=800):
    for i in range(0, len(lst), size):
        yield lst[i:i+size]

def clean_key(val):
    val = str(val).strip().upper()
    return re.sub(r"[.#$/\[\]\s]+", "_", val)

def clean_df(df):
    df = df.copy()
    df.columns = [c.lower() for c in df.columns]
    df = df.where(pd.notnull(df), None)
    return df

def row_hash(row):
    return hashlib.md5(json.dumps(row, sort_keys=True, default=str).encode()).hexdigest()

# =========================
# MES
# =========================
def get_chassis():
    url = "https://firebase-api-2mx9.onrender.com/api/mes-schedule"
    data = requests.get(url).json()["schedule"]

    df = pd.DataFrame(data)

    df["Chassis"] = df["Chassis"].astype(str).str.strip().str.upper()
    df["RegentProduction"] = df["RegentProduction"].fillna("").str.lower()

    df["Is_Sea"] = df["RegentProduction"].apply(
        lambda x: True if x == "van on the sea" else False
    )

    df = df[~df["Chassis"].str.startswith(("SRV", "SRM"))]

    return df[["Chassis", "Is_Sea"]]

# =========================
# SAP
# =========================
def get_production_orders(chassis_list):
    if not chassis_list:
        return pd.DataFrame(columns=["Chassis", "ProductionOrder"])

    all_df = []

    with pyodbc.connect(DSN) as conn:
        for chunk in chunk_list(chassis_list):
            sql = f"""
            SELECT
                objk."SERNR" AS "Chassis",
                afko."AUFNR" AS "ProductionOrder"
            FROM SAPHANADB.SER02 s2
            JOIN SAPHANADB.OBJK objk ON objk."OBKNR" = s2."OBKNR"
            JOIN SAPHANADB.AFPO afpo ON afpo."KDAUF" = s2."SDAUFNR"
            JOIN SAPHANADB.AFKO afko ON afko."AUFNR" = afpo."AUFNR"
            WHERE objk."SERNR" IN ({",".join([f"'{c}'" for c in chunk])})
              AND objk."MANDT"='800'
            """

            df = pd.read_sql(sql, conn)
            if not df.empty:
                all_df.append(df)

    return pd.concat(all_df, ignore_index=True) if all_df else pd.DataFrame(
        columns=["Chassis", "ProductionOrder"]
    )

def get_resb_data(po_df):
    if po_df.empty:
        return pd.DataFrame(columns=[
            "ProductionOrder","Part","RequiredQty","IssuedQty","OpenQty"
        ])

    orders = po_df["ProductionOrder"].dropna().unique()

    with pyodbc.connect(DSN) as conn:
        sql = f"""
        SELECT
            r."AUFNR" AS "ProductionOrder",
            r."MATNR" AS "Part",
            r."BDMNG" AS "RequiredQty",
            r."ENMNG" AS "IssuedQty",
            r."BDMNG" - r."ENMNG" AS "OpenQty"
        FROM SAPHANADB.RESB r
        WHERE r."WERKS"='3111'
          AND r."MANDT"='800'
          AND r."AUFNR" IN ({",".join([f"'{o}'" for o in orders])})
        """
        df = pd.read_sql(sql, conn)

    return df if not df.empty else pd.DataFrame(columns=[
        "ProductionOrder","Part","RequiredQty","IssuedQty","OpenQty"
    ])

def get_inventory():
    sql = """
    SELECT MATNR AS "Part", SUM(LABST) AS "StockQty"
    FROM SAPHANADB.NSDM_V_MARD
    WHERE WERKS='3111'
    GROUP BY MATNR
    """
    with pyodbc.connect(DSN) as conn:
        return pd.read_sql(sql, conn)

def get_open_po_details():
    sql = """
    SELECT
        ekpo."EBELN" AS "PO_Number",
        ekpo."EBELP" AS "PO_Item",
        ekpo."MATNR" AS "Part",
        ekko."LIFNR" AS "Vendor",
        ekko."BEDAT" AS "OrderDate",
        eket."EINDT" AS "DeliveryDate",
        eket."MENGE" AS "OrderQty",
        COALESCE(eket."WEMNG",0) AS "ReceivedQty",
        eket."MENGE" - COALESCE(eket."WEMNG",0) AS "OpenQty"
    FROM SAPHANADB.EKPO ekpo
    JOIN SAPHANADB.EKET eket
      ON ekpo."EBELN" = eket."EBELN"
     AND ekpo."EBELP" = eket."EBELP"
    JOIN SAPHANADB.EKKO ekko
      ON ekpo."EBELN" = ekko."EBELN"
    WHERE ekpo."WERKS"='3111'
      AND (eket."MENGE" - COALESCE(eket."WEMNG",0)) > 0
    """
    with pyodbc.connect(DSN) as conn:
        return pd.read_sql(sql, conn)

# =========================
# Kanban
# =========================
def get_kanban_parts():
    sql = """
    SELECT DISTINCT MATNR
    FROM SAPHANADB.PKHD
    WHERE WERKS='3111' AND MANDT='800'
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
    WHERE marc."WERKS"='3111'
      AND marc."MANDT"='800'
    """
    with pyodbc.connect(DSN) as conn:
        return pd.read_sql(sql, conn)

# =========================
# Build Dataset
# =========================
def build_dataset(chassis_df):
    po_df = get_production_orders(chassis_df["Chassis"].tolist())
    resb_df = get_resb_data(po_df)

    df = po_df.merge(resb_df, on="ProductionOrder", how="left")
    df = df.merge(chassis_df, on="Chassis", how="left")

    return df

# =========================
# Summary（最终版）
# =========================
def build_summary(df, inv):

    df["Is_Sea"] = df["Is_Sea"].fillna(False)

    summary = df.groupby("Part").agg({
        "RequiredQty":"sum",
        "IssuedQty":"sum",
        "OpenQty":"sum"
    }).reset_index()

    nosea = df[df["Is_Sea"]==False].groupby("Part")["RequiredQty"].sum().reset_index()
    nosea.rename(columns={"RequiredQty":"nosea_required_qty"}, inplace=True)

    sea = df[df["Is_Sea"]==True].groupby("Part")["RequiredQty"].sum().reset_index()
    sea.rename(columns={"RequiredQty":"sea_required_qty"}, inplace=True)

    summary = summary.merge(nosea, on="Part", how="left")
    summary = summary.merge(sea, on="Part", how="left")

    summary.fillna(0, inplace=True)

    summary = summary.merge(inv, on="Part", how="left")
    summary["StockQty"] = summary["StockQty"].fillna(0)

    # Kanban
    kanban_parts = get_kanban_parts()
    summary["Is_Kanban"] = summary["Part"].apply(lambda x: x in kanban_parts)

    extra = get_kanban_extra()
    summary = summary.merge(extra, on="Part", how="left")

    open_po = get_open_po_details()
    po_sum = open_po.groupby("Part")["OpenQty"].sum().reset_index()
    po_sum.rename(columns={"OpenQty":"open_po_qty"}, inplace=True)

    summary = summary.merge(po_sum, on="Part", how="left")
    summary["open_po_qty"] = summary["open_po_qty"].fillna(0)

    summary.rename(columns={
        "RequiredQty":"total_required_qty",
        "IssuedQty":"issued_qty",
        "OpenQty":"open_qty",
        "StockQty":"stock_qty",
        "LeadTime":"lead_time",
        "SafetyStock":"safety_stock"
    }, inplace=True)

    return summary

# =========================
# Firebase 写入
# =========================
def to_keyed_summary(df):
    df = clean_df(df)
    return {
        clean_key(row["part"]): row.to_dict()
        for _, row in df.iterrows()
    }

def to_keyed_open_po(df):
    df = clean_df(df)
    result = {}

    for _, row in df.iterrows():
        d = row.to_dict()
        key = f"{clean_key(d['po_number'])}_{clean_key(d['po_item'])}"
        result[key] = d

    return result

def overwrite_table(name, records):
    ref = db.reference(f"{ROOT}/{name}")
    ref.set({
        "items": records,
        "meta": {
            "updated": datetime.now().isoformat(),
            "count": len(records)
        }
    })

def update_table(name, records):
    ref = db.reference(f"{ROOT}/{name}")

    old_hash = ref.child("hash").get() or {}
    new_hash = {k: row_hash(v) for k,v in records.items()}

    updates = {}

    for k,v in records.items():
        if old_hash.get(k) != new_hash[k]:
            updates[f"items/{k}"] = v
            updates[f"hash/{k}"] = new_hash[k]

    for k in old_hash:
        if k not in new_hash:
            updates[f"items/{k}"] = None
            updates[f"hash/{k}"] = None

    updates["meta/updated"] = datetime.now().isoformat()

    items = list(updates.items())
    for i in range(0, len(items), 300):
        ref.update(dict(items[i:i+300]))

# =========================
# Upload
# =========================
def upload(df):
    inv = get_inventory()

    summary = build_summary(df, inv)
    open_po = get_open_po_details()

    overwrite_table("summary", to_keyed_summary(summary))
    update_table("open_po", to_keyed_open_po(open_po))

# =========================
# MAIN
# =========================
def main():
    init_firebase()
    chassis = get_chassis()
    df = build_dataset(chassis)
    upload(df)
    print("🚀 Done")

if __name__ == "__main__":
    main()
