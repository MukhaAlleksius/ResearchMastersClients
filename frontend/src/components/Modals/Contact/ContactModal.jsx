import React from "react";

export default function ContactModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal fixed inset-0 bg-gray-600 bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg max-w-md w-full m-4">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-gray-900">
              Связаться с исполнителем
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Закрыть модальное окно"
              type="button"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>

          <div className="space-y-4">
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full mx-auto mb-4 flex items-center justify-center">
                <i className="fas fa-user text-white text-2xl"></i>
              </div>
              <h4 className="text-lg font-semibold">Алексей Михайлов</h4>
              <p className="text-gray-600">Мастер по ремонту</p>
            </div>

            <div className="space-y-3">
              <button className="w-full bg-green-500 text-white py-3 rounded-lg hover:bg-green-600 flex items-center justify-center">
                <i className="fab fa-whatsapp mr-2"></i>
                Написать в WhatsApp
              </button>

              <button className="w-full bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 flex items-center justify-center">
                <i className="fab fa-telegram mr-2"></i>
                Написать в Telegram
              </button>

              <button className="w-full bg-gray-600 text-white py-3 rounded-lg hover:bg-gray-700 flex items-center justify-center">
                <i className="fas fa-phone mr-2"></i>
                Позвонить
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
