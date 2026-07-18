export default function HomePage({ showPage, openModal }) {
  return (
    <div className="page active">
      <section className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Найдите надежного исполнителя для любой задачи
          </h1>
          <p className="text-xl mb-8">
            Более 500 проверенных мастеров готовы помочь вам прямо сейчас
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => showPage("order")}
              className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-lg text-lg font-semibold"
            >
              Разместить заказ
            </button>
            <button
              onClick={() => openModal("executorModal")}
              className="bg-transparent border-2 border-white hover:bg-white hover:text-blue-600 text-white px-8 py-3 rounded-lg text-lg font-semibold"
            >
              Стать исполнителем
            </button>
          </div>
        </div>
      </section>

      {/* Здесь компонент ServiceCategories можно создать отдельно для блока популярных услуг */}
      <ServiceCategories />
    </div>
  );
}
