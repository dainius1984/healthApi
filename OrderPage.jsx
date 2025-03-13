import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../AuthContext';
import TopNavBar from '../Headers/TopNavBar';
import Header from '../Headers/Header';
import Footer from '../Footer/Footer';
import BillingForm from './BillingForm';
import OrderSummary from './OrderSummary';
import { 
  generateOrderNumber,
  calculateTotals,
  formatOrderItems,
  validateForm,
  validateDiscountCode,
  DISCOUNT_CONFIG,
  getShippingCost,
  isEligibleForFreeShipping,
  formatDate,
} from './OrderUtils';
import { initiatePayment } from './PaymentService';

const INITIAL_FORM_STATE = {
  firstName: '',
  lastName: '',
  company: '',
  street: '',
  postal: '',
  city: '',
  phone: '',
  email: '',
  notes: '',
  shipping: 'DPD' // Default shipping method
};

const OrderPage = () => {
  const { state, dispatch } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);

  // Redirect if cart is empty
  useEffect(() => {
    if (!state.cart?.length) {
      navigate('/cart');
    }
  }, [state.cart, navigate]);

  // Calculate order totals with shipping
  const { subtotal, discountAmount, total } = calculateTotals(
    state.cart,
    state.isDiscountApplied
  );

  // Notification handler
  const showNotification = (message, type = 'error', duration = 5000) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), duration);
  };

  // Form input handler
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value.trim()
    }));
  };

  // Shipping method handler
  const handleShippingChange = (method) => {
    console.log('Shipping method changed to:', method);
    setFormData(prev => ({
      ...prev,
      shipping: method
    }));
  };

  // Discount code handler
  const handleApplyDiscount = (code) => {
    if (state.isDiscountApplied) {
      showNotification('Kod rabatowy został już wykorzystany w tym zamówieniu.', 'error', 3000);
      return;
    }

    if (validateDiscountCode(code)) {
      dispatch({ type: 'APPLY_DISCOUNT', payload: code });
      showNotification(
        `Kod rabatowy ${DISCOUNT_CONFIG.percentage}% został pomyślnie zastosowany!`,
        'success',
        3000
      );
    } else {
      showNotification('Nieprawidłowy kod rabatowy.', 'error', 3000);
    }
  };

  // Create payment data object
  const createPaymentData = (orderNumber) => {
    const isFreeShipping = isEligibleForFreeShipping(subtotal);
    const shippingCost = isFreeShipping ? 0 : getShippingCost(subtotal, formData.shipping);
    const finalTotal = total + shippingCost;

    return {
      orderData: {
        orderNumber,
        total: finalTotal.toString(),
        cart: state.cart.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price.toString(),
          unitPrice: item.price.toString()
        })),
        shipping: formData.shipping,
        shippingCost: shippingCost.toString(),
        discountApplied: state.isDiscountApplied,
        discountAmount: discountAmount.toString(),
        subtotal: subtotal.toString(),
        userId: user?.$id,
        createdAt: new Date().toISOString(),
        paymentStatus: 'PENDING'
      },
      customerData: {
        Imie: formData.firstName?.trim(),
        Nazwisko: formData.lastName?.trim(),
        Email: formData.email?.trim().toLowerCase(),
        Telefon: formData.phone?.trim(),
        Ulica: formData.street?.trim(),
        'Kod pocztowy': formData.postal?.trim(),
        Miasto: formData.city?.trim(),
        Firma: formData.company?.trim() || '',
        Uwagi: formData.notes?.trim() || ''
      },
      isAuthenticated: !!user,
      userId: user?.$id || null,
      shippingDetails: {
        method: formData.shipping,
        cost: shippingCost.toString()
      },
      discountApplied: state.isDiscountApplied,
      discountAmount: discountAmount.toString(),
      discountPercentage: DISCOUNT_CONFIG.percentage
    };
  };

  // Handle order submission
  const handleSubmitOrder = async (e) => {
    e.preventDefault();
    
    const errors = validateForm(formData);
    if (errors.length > 0) {
      showNotification(errors[0]);
      return;
    }

    setLoading(true);
    setNotification(null);

    try {
      const orderNumber = generateOrderNumber();
      
      // Store paczkomat data in localStorage if it exists
      if (formData.paczkomat) {
        localStorage.setItem(`paczkomat_data_${orderNumber}`, JSON.stringify(formData.paczkomat));
      }
      
      // Create basic order data
      const orderData = {
        orderNumber,
        status: 'pending',
        subtotal: Number(subtotal).toFixed(2),
        total: (Number(total) + (isEligibleForFreeShipping(subtotal) ? 0 : getShippingCost(subtotal, formData.shipping))).toFixed(2),
        discountApplied: state.isDiscountApplied,
        discountAmount: Number(discountAmount).toFixed(2),
        shippingCost: (isEligibleForFreeShipping(subtotal) ? 0 : getShippingCost(subtotal, formData.shipping)).toFixed(2),
        createdAt: new Date().toISOString(),
        lastUpdateTime: new Date().toISOString(),
        items: formatOrderItems(state.cart),
        shipping: formData.shipping,
        payuOrderId: null,
        paymentStatus: 'PENDING',
        hasPaczkomatData: !!formData.paczkomat
      };
      
      // Create backup in localStorage
      const backupKey = `order_backup_${orderNumber}`;
      localStorage.setItem(backupKey, JSON.stringify({
        ...orderData,
        backupTime: new Date().toISOString(),
        paymentStatus: 'PENDING'
      }));

      console.log('Creating order:', {
        orderNumber,
        total,
        shipping: formData.shipping,
        isAuthenticated: !!user,
        time: new Date().toISOString()
      });

      const paymentData = createPaymentData(orderNumber);
      
      // Store order data for confirmation page with customer information for InPost
      sessionStorage.setItem('lastOrder', JSON.stringify({
        ...orderData,
        date: formatDate(new Date()),
        // Add customer information needed for InPost shipment
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        street: formData.street,
        postal: formData.postal,
        city: formData.city
      }));
      
      const response = await initiatePayment(paymentData);
      
      console.log('Payment initiated:', {
        orderNumber,
        payuOrderId: response.orderId,
        hasRedirectUrl: !!response.redirectUrl,
        shipping: formData.shipping,
        time: new Date().toISOString()
      });

      if (response.redirectUrl) {
        window.location.href = response.redirectUrl;
      } else {
        throw new Error('Nie otrzymano linku do płatności');
      }

    } catch (error) {
      console.error('Order creation error:', {
        message: error.message,
        stack: error.stack,
        time: new Date().toISOString()
      });
      
      showNotification(
        error.message || 'Wystąpił błąd podczas składania zamówienia. Prosimy spróbować później.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Loading state
  if (!state.cart?.length) {
    return (
      <>
        <TopNavBar />
        <Header />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-800 mx-auto"></div>
            <p className="mt-4 text-gray-600">Ładowanie...</p>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  // Notification component
  const NotificationComponent = () => notification && (
    <div className={`fixed bottom-4 right-4 z-50 transition-all duration-300 transform ${
      notification ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
    }`}>
      <div className={`px-6 py-3 rounded-lg shadow-lg ${
        notification.type === 'error' ? 'bg-red-500' : 'bg-green-600'
      } text-white text-sm sm:text-base max-w-xs sm:max-w-md`}>
        {notification.message}
      </div>
    </div>
  );

  return (
    <>
      <TopNavBar />
      <Header />
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold mb-4 sm:mb-6 lg:mb-8">
            Zamówienie {user ? '(Zalogowany)' : '(Gość)'}
          </h1>
          
          <div className="mt-4">
            <form onSubmit={handleSubmitOrder} className="grid grid-cols-1 lg:grid-cols-[1.5fr,1fr] gap-6 lg:gap-10">
              {/* Order summary appears first on mobile for better UX */}
              <div className="order-1 lg:order-2">
                <OrderSummary
                  cart={state.cart}
                  subtotal={subtotal}
                  discountApplied={state.isDiscountApplied}
                  discountAmount={discountAmount}
                  discountPercentage={DISCOUNT_CONFIG.percentage}
                  total={total}
                  shipping={formData.shipping}
                  setShipping={handleShippingChange}
                  loading={loading}
                  onApplyDiscount={handleApplyDiscount}
                  formData={formData}
                />
              </div>
              
              {/* Billing form appears second on mobile */}
              <div className="order-2 lg:order-1">
                <BillingForm 
                  formData={formData}
                  handleInputChange={handleInputChange}
                />
              </div>
            </form>
          </div>

          <NotificationComponent />
        </div>
      </div>
      <Footer />
    </>
  );
};

export default OrderPage; 