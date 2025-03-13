import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { setPaymentFlowState } from '../authService'; // Import the function
import TopNavBar from '../Headers/TopNavBar';
import Header from '../Headers/Header';
import Footer from '../Footer/Footer';
import { useAuth } from '../AuthContext'; // Add this import
import { databases, Query } from '../appwrite'; // Import databases and Query from appwrite.js

// Add this function to create InPost shipments
const createInPostShipment = async (orderData) => {
  try {
    // Check if we have paczkomat data
    if (!orderData.paczkomat) {
      console.error('No paczkomat data available for shipment creation');
      return { success: false, error: 'Missing paczkomat data' };
    }

    // Prepare the payload for the API
    const payload = {
      orderNumber: orderData.orderNumber,
      recipient: {
        name: `${orderData.firstName} ${orderData.lastName}`,
        email: orderData.email,
        phone: orderData.phone,
        paczkomatId: orderData.paczkomat.name // This should be the paczkomat ID
      },
      packageDetails: {
        size: 'A', // Default size, adjust based on your needs
        weight: 1.0 // Default weight in kg, adjust based on your needs
      }
    };

    // Call the backend API
    const response = await fetch('/api/shipping/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.details || 'Failed to create shipment');
    }

    console.log('Shipment created successfully:', data);
    return { success: true, data };
  } catch (error) {
    console.error('Error creating InPost shipment:', error);
    return { success: false, error: error.message };
  }
};

const OrderConfirmation = () => {
  // ... existing code ...
  const [shipmentStatus, setShipmentStatus] = useState(null);
  
  // ... existing code ...

  // Add this function to handle shipment creation
  const handleCreateShipment = async () => {
    if (!orderData || !orderData.paczkomat) {
      return;
    }

    // Only create shipment if payment is complete
    if (paymentStatus !== 'Opłacone') {
      console.log('Payment not completed yet, skipping shipment creation');
      return;
    }

    try {
      const result = await createInPostShipment({
        ...orderData,
        firstName: orderData.firstName || '',
        lastName: orderData.lastName || '',
        email: orderData.email || '',
        phone: orderData.phone || ''
      });

      if (result.success) {
        setShipmentStatus({
          status: 'success',
          trackingNumber: result.data.trackingNumber,
          labelUrl: result.data.labelUrl
        });
      } else {
        setShipmentStatus({
          status: 'error',
          message: result.error
        });
      }
    } catch (error) {
      console.error('Error in shipment creation:', error);
      setShipmentStatus({
        status: 'error',
        message: error.message
      });
    }
  };

  // Add effect to create shipment when payment is complete
  useEffect(() => {
    if (paymentStatus === 'Opłacone' && orderData?.paczkomat && !shipmentStatus) {
      handleCreateShipment();
    }
  }, [paymentStatus, orderData]);

  // ... existing code ...

  // Add this function to render shipment status
  const renderShipmentStatus = () => {
    if (!shipmentStatus) {
      // If no shipment status and payment is complete, show create shipment button
      if (paymentStatus === 'Opłacone' && orderData?.paczkomat) {
        return (
          <div className="mt-4 p-3 bg-blue-50 rounded-md">
            <h2 className="font-semibold text-gray-700">Status wysyłki:</h2>
            <div className="flex items-center mt-1">
              <span className="inline-block w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
              <span className="text-gray-600">Oczekuje na utworzenie</span>
            </div>
            <button
              onClick={handleCreateShipment}
              className="mt-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm"
            >
              Utwórz przesyłkę InPost
            </button>
          </div>
        );
      }
      return null;
    }

    if (shipmentStatus.status === 'success') {
      return (
        <div className="mt-4 p-3 bg-green-50 rounded-md">
          <h2 className="font-semibold text-gray-700">Status wysyłki:</h2>
          <div className="flex items-center mt-1">
            <span className="inline-block w-3 h-3 bg-green-500 rounded-full mr-2"></span>
            <span className="text-gray-600">Przesyłka utworzona</span>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Numer śledzenia: {shipmentStatus.trackingNumber}
          </p>
          {shipmentStatus.labelUrl && (
            <a 
              href={shipmentStatus.labelUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline mt-1 inline-block"
            >
              Pobierz etykietę
            </a>
          )}
        </div>
      );
    }

    if (shipmentStatus.status === 'error') {
      return (
        <div className="mt-4 p-3 bg-red-50 rounded-md">
          <h2 className="font-semibold text-gray-700">Status wysyłki:</h2>
          <div className="flex items-center mt-1">
            <span className="inline-block w-3 h-3 bg-red-500 rounded-full mr-2"></span>
            <span className="text-gray-600">Błąd tworzenia przesyłki</span>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            {shipmentStatus.message || 'Wystąpił błąd podczas tworzenia przesyłki.'}
          </p>
          <button
            onClick={handleCreateShipment}
            className="mt-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm"
          >
            Spróbuj ponownie
          </button>
        </div>
      );
    }

    return null;
  };

  // ... existing code ...

  // Add the shipment status to the return JSX
  return (
    <>
      <TopNavBar />
      <Header />
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-3xl mx-auto px-4">
          <div className="bg-white rounded-lg shadow-md p-6 md:p-8">
            {/* ... existing code ... */}
            
            <div className="border-t border-b border-gray-200 py-4 my-6">
              <div className="flex flex-col md:flex-row justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-gray-700">Numer zamówienia:</h2>
                  <p className="text-gray-600">{orderData.orderNumber}</p>
                </div>
                <div className="mt-4 md:mt-0">
                  <h2 className="font-semibold text-gray-700">Data zamówienia:</h2>
                  <p className="text-gray-600">
                    {new Date(orderData.date).toLocaleDateString()}
                  </p>
                </div>
              </div>
              
              {/* Display paczkomat data if available */}
              {orderData.paczkomat && (
                <div className="mb-4 p-3 bg-gray-50 rounded-md">
                  <h2 className="font-semibold text-gray-700">Wybrany paczkomat:</h2>
                  <div className="mt-2">
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <p className="font-bold">{orderData.paczkomat.name}</p>
                    </div>
                    <p className="ml-7 text-gray-600">{orderData.paczkomat.address}</p>
                    {orderData.paczkomat.post_code && (
                      <p className="ml-7 text-gray-600">{orderData.paczkomat.post_code} {orderData.paczkomat.city}</p>
                    )}
                  </div>
                </div>
              )}
              
              <div className="mb-4">
                <h2 className="font-semibold text-gray-700">Status płatności:</h2>
                {renderPaymentStatus()}
                <p className="text-sm text-gray-500 mt-1">
                  {paymentStatus === 'Opłacone' 
                    ? 'Dziękujemy! Twoja płatność została zrealizowana.' 
                    : paymentStatus === 'Anulowane' || paymentStatus === 'Odrzucone'
                      ? 'Płatność nie została zrealizowana. Prosimy spróbować ponownie lub skontaktować się z nami.'
                      : 'Po potwierdzeniu płatności, wyślemy Ci e-mail z potwierdzeniem.'}
                </p>
              </div>
              
              {/* Add shipment status section */}
              {renderShipmentStatus()}
            </div>
            
            {/* ... rest of existing code ... */}
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
};

export default OrderConfirmation; 