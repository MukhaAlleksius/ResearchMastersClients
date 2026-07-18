import React from "react";

export default function ExecutorInfo({ contractor }) {
  if (!contractor) {
    return <div>Информация об исполнителе недоступна</div>;
  }

  const { name, company, email, phone, address, notes } = contractor;

  const styles = {
    container: {
      maxWidth: 700,
      margin: "20px auto",
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      padding: 20,
      backgroundColor: "#f9f9f9",
      borderRadius: 8,
      boxShadow: "0 0 8px rgba(0,0,0,0.1)",
    },
    heading: {
      fontSize: 22,
      marginBottom: 12,
      color: "#333",
      borderBottom: "2px solid #007bff",
      paddingBottom: 6,
    },
    label: {
      fontWeight: "bold",
      color: "#555",
      display: "inline-block",
      width: 120,
    },
    paragraph: {
      margin: "6px 0",
      color: "#444",
    },
    link: {
      color: "#007bff",
      textDecoration: "none",
    },
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Информация об исполнителе</h2>
      <p style={styles.paragraph}>
        <span style={styles.label}>ФИО:</span> {name}
      </p>
      {company && (
        <p style={styles.paragraph}>
          <span style={styles.label}>Компания:</span> {company}
        </p>
      )}
      {email && (
        <p style={styles.paragraph}>
          <span style={styles.label}>Email:</span>{" "}
          <a href={`mailto:${email}`} style={styles.link}>
            {email}
          </a>
        </p>
      )}
      {phone && (
        <p style={styles.paragraph}>
          <span style={styles.label}>Телефон:</span>{" "}
          <a href={`tel:${phone}`} style={styles.link}>
            {phone}
          </a>
        </p>
      )}
      {address && (
        <p style={styles.paragraph}>
          <span style={styles.label}>Адрес:</span> {address}
        </p>
      )}
      {notes && (
        <>
          <strong>Примечания:</strong>
          <p style={styles.paragraph}>{notes}</p>
        </>
      )}
    </div>
  );
}
