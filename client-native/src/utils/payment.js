import { Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { getErrorMessage } from '../services/api';
import { getReceiptLink } from '../services/payments';

/** Opens a paid job's receipt PDF in the browser, where it can be saved or shared. */
export async function openReceipt(paymentId, t) {
  try {
    await WebBrowser.openBrowserAsync(await getReceiptLink(paymentId));
  } catch (err) {
    Alert.alert(t('payment.receiptFailedTitle'), getErrorMessage(err));
  }
}
