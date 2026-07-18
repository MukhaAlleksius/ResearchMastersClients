from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import Optional
import os
import uuid
import time

from core.env_loader import load_env_file

load_env_file()

app = FastAPI(title="Mock WebPay")

CALLBACK_SECRET = os.getenv("PAYMENT_CALLBACK_SECRET")
if not CALLBACK_SECRET:
    raise RuntimeError(
        "PAYMENT_CALLBACK_SECRET must be set. Copy .env.example to .env."
    )

_public_api_url = (os.getenv("PUBLIC_API_URL") or "").rstrip("/")
BACKEND_CALLBACK_URL = (
    os.getenv("PAYMENT_CALLBACK_URL")
    or (f"{_public_api_url}/payment/callback" if _public_api_url else "")
)
if not BACKEND_CALLBACK_URL:
    raise RuntimeError(
        "Set PAYMENT_CALLBACK_URL or PUBLIC_API_URL for mock WebPay."
    )


class PaymentRequest(BaseModel):
    WebPayPid: str
    Amount: str
    Currency: str = "BYN"
    Description: Optional[str] = None


class PaymentResponse(BaseModel):
    PaymentId: str
    PaymentUrl: str
    ResultUrl: str
    OrderId: str


payments_db = {}


@app.post("/payment", response_model=PaymentResponse)
async def create_payment(request: PaymentRequest):
    payment_id = str(uuid.uuid4())[:8].upper()

    payments_db[payment_id] = {
        "order_id": request.WebPayPid,
        "amount": float(request.Amount),
        "status": "pending",
        "created_at": time.time(),
        "completed_at": None,
    }

    return PaymentResponse(
        PaymentId=payment_id,
        PaymentUrl=f"http://localhost:8001/mock-webpay/pay/{payment_id}",
        ResultUrl=f"http://localhost:8001/mock-webpay/result/{payment_id}",
        OrderId=request.WebPayPid,
    )


@app.get("/payment/{payment_id}")
async def get_payment(payment_id: str):
    payment = payments_db.get(payment_id)
    if not payment:
        raise HTTPException(404, "Payment not found")
    return payment


@app.post("/payment/{payment_id}/capture")
async def capture_payment(payment_id: str):
    payment = payments_db.get(payment_id)
    if not payment:
        raise HTTPException(404, "Payment not found")

    if payment["status"] != "pending":
        raise HTTPException(400, "Payment not pending")

    payment["status"] = "succeeded"
    payment["completed_at"] = time.time()

    return {"status": "success", "message": "Payment captured"}


@app.get("/mock-webpay/pay/{payment_id}")
async def mock_payment_page(payment_id: str):
    payment = payments_db.get(payment_id)
    if not payment:
        return HTMLResponse(content="Payment not found", status_code=404)

    secret_js = CALLBACK_SECRET.replace("\\", "\\\\").replace("'", "\\'")
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Mock WebPay</title>
    </head>
    <body style="font-family: Arial; max-width: 500px; margin: 50px auto; padding: 40px; border: 2px solid #10b981; border-radius: 16px;">
        <h2 style="color: #10b981;">💳 Mock WebPay</h2>
        <p><strong>Заказ #{payment['order_id']}</strong></p>
        <p><strong>{payment['amount']} BYN</strong></p>
        <button id="payButton" onclick="pay('{payment_id}')" style="width: 100%; padding: 16px; background: #10b981; color: white; border: none; border-radius: 12px; font-size: 18px; cursor: pointer;">
            ✅ Оплатить {payment['amount']} BYN
        </button>
        <script>
        async function pay(paymentId) {{
            const button = document.getElementById('payButton');
            button.innerText = '⏳ Проверяем...';
            button.disabled = true;
            setTimeout(async () => {{
                try {{
                    const response = await fetch('{BACKEND_CALLBACK_URL}', {{
                        method: 'POST',
                        headers: {{
                            'Content-Type': 'application/json',
                            'X-Payment-Secret': '{secret_js}'
                        }},
                        body: JSON.stringify({{payment_id: paymentId, status: 'escrow'}})
                    }});
                    if (response.ok) {{
                        window.location.href = '/mock-webpay/success/' + paymentId;
                    }} else {{
                        alert('Ошибка оплаты!');
                        button.innerText = 'Повторить оплату';
                        button.disabled = false;
                    }}
                }} catch (error) {{
                    alert('Ошибка сети: ' + error.message);
                    button.innerText = 'Повторить оплату';
                    button.disabled = false;
                }}
            }}, 1500);
        }}
        </script>
    </body>
    </html>
    """
    return HTMLResponse(
        content=html,
        status_code=200,
        headers={"Content-Type": "text/html; charset=utf-8"},
    )


@app.get("/mock-webpay/success/{payment_id}")
async def success_page(payment_id: str):
    payment = payments_db.get(payment_id)
    if not payment:
        return HTMLResponse(content="Payment not found", status_code=404)
    payment["status"] = "succeeded"
    return HTMLResponse(
        content=f"""
    <div style="text-align: center; padding: 40px; font-family: Arial;">
        <div style="font-size: 48px; color: #10b981;">✅</div>
        <h2 style="color: #10b981;">Оплата прошла успешно!</h2>
        <p><strong>Заказ #{payment['order_id']}</strong></p>
        <p><strong>{payment['amount']} BYN</strong></p>
        <p>Средства заморожены в эскроу до подтверждения выполнения.</p>
        <p>Можно закрыть это окно и вернуться в приложение.</p>
    </div>
    """
    )


@app.get("/mock-webpay/result/{payment_id}")
async def result_page(payment_id: str):
    payment = payments_db.get(payment_id)
    if not payment:
        return HTMLResponse(content="Payment not found", status_code=404)

    status = "Успешно" if payment["status"] == "succeeded" else "В обработке"
    return HTMLResponse(
        content=f"""
    <div style="text-align: center; padding: 40px; font-family: Arial;">
        <h2>Результат оплаты</h2>
        <p>Заказ #{payment['order_id']}</p>
        <p>Сумма: {payment['amount']} BYN</p>
        <p>Статус: <strong>{status}</strong></p>
    </div>
    """
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
