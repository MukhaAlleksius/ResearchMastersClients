import UserOrdersScientist from "../../UserOrdersProfileAdmin/UserOrdersScientist/UserOrdersScientist";

export default function UserServicesScientist({ userId }) {
  return (
    <UserOrdersScientist
      userId={userId}
      endpoint="services_executor_admin"
      title="Анализ услуг"
      statusKey="status_service_executor"
      emptyLabel="услуг"
    />
  );
}
