// services/AppwriteService.js
const { Client, Databases } = require('node-appwrite');

class AppwriteService {
  constructor() {
    this.client = new Client()
      .setEndpoint('https://cloud.appwrite.io/v1')
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

    this.databases = new Databases(this.client);
  }

  async storeOrder(orderData) {
    try {
      const document = await this.databases.createDocument(
        process.env.APPWRITE_DATABASE_ID,
        process.env.APPWRITE_ORDERS_COLLECTION_ID,
        ID.unique(),
        orderData
      );
      console.log('Order stored in Appwrite:', orderData.orderNumber);
      return document;
    } catch (error) {
      console.error('Appwrite storage error:', error);
      throw error;
    }
  }

  async updateOrderStatus(orderId, status) {
    try {
      const query = [`payuOrderId=${orderId}`];
      const documents = await this.databases.listDocuments(
        process.env.APPWRITE_DATABASE_ID,
        process.env.APPWRITE_ORDERS_COLLECTION_ID,
        query
      );

      if (documents && documents.documents.length > 0) {
        await this.databases.updateDocument(
          process.env.APPWRITE_DATABASE_ID,
          process.env.APPWRITE_ORDERS_COLLECTION_ID,
          documents.documents[0].$id,
          { status }
        );
        console.log('Updated order status in Appwrite:', orderId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error updating order status in Appwrite:', error);
      throw error;
    }
  }
}

module.exports = new AppwriteService();