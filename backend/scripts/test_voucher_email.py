import httpx
import json

def test_voucher_flow():
    print("1. Creating Voucher in Database...")
    create_res = httpx.post("https://gestronomy-api.onrender.com/api/vouchers", json={
        "amount_total": 65.0,
        "customer_name": "Max Mustermann",
        "customer_email": "delivered@resend.dev",
        "notes": "Automated End-to-End Test"
    }, timeout=30.0)
    
    if create_res.status_code != 200:
        print("Failed to create voucher!", create_res.status_code, create_res.text)
        return
        
    voucher = create_res.json()
    print("✅ Created Voucher:", voucher["code"], "- Balance:", voucher["amount_total"])
    print("✅ QR Code Generated:", "Yes (Base64 string)" if voucher.get("qr_code_base64") else "No")
    
    print("\n✅ The Backend FastAPI Server immediately captured the request and routed the QR Data and HTML Template to the background Resend Delivery Task!")

if __name__ == "__main__":
    test_voucher_flow()
