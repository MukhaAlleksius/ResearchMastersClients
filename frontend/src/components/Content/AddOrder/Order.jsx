import React from "react";
import AddOrderForAllExecutors from "./AddOrder/AddOrderForAllExecutors";

export default function OrderPage({ openModal }) {
  const isLoggedIn = Boolean(localStorage.getItem("access_token"));

  return (
    <AddOrderForAllExecutors
      showAuthBanner={!isLoggedIn}
      openModal={openModal}
    />
  );
}
