export default function AdminCancelVerdictNotice({ cancellation }) {
  if (!cancellation || cancellation.status !== "resolved") return null;

  const customerShare = cancellation.refund_amount_customer;
  const executorShare = cancellation.refund_amount_executor;
  const hasShares =
    customerShare != null &&
    customerShare !== "" &&
    executorShare != null &&
    executorShare !== "";

  return (
    <div className="cancel-tab__notice cancel-tab__notice--success">
      <strong>Решение администратора</strong>
      <p className="cancel-tab__reason-text">
        {cancellation.admin_comment?.trim() ||
          "Администратор рассмотрел спор и вынес решение."}
      </p>
      {hasShares && (
        <p className="cancel-tab__reason-text">
          Возврат: {Number(customerShare)}% заказчику · {Number(executorShare)}%
          исполнителю
        </p>
      )}
    </div>
  );
}
