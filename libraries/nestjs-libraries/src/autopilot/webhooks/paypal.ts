import { Injectable, Logger } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaypalWebhookHeaders {
  'paypal-transmission-id': string;
  'paypal-transmission-time': string;
  'paypal-cert-url': string;
  'paypal-auth-algo': string;
  'paypal-transmission-sig': string;
}

// ---------------------------------------------------------------------------
// PaypalWebhookService
// ---------------------------------------------------------------------------

/**
 * Handles PayPal webhook verification and event dispatching.
 *
 * Signature verification delegates to PayPal's
 * `POST /v1/notifications/verify-webhook-signature` endpoint, which requires
 * a valid OAuth 2.0 client-credentials token obtained using
 * `AP_PAYPAL_CLIENT_ID` + `AP_PAYPAL_CLIENT_SECRET`.
 *
 * Set `AP_PAYPAL_WEBHOOK_ID` to the webhook ID registered in the PayPal
 * developer dashboard.
 */
@Injectable()
export class PaypalWebhookService {
  private readonly logger = new Logger(PaypalWebhookService.name);

  private get baseUrl(): string {
    // Use sandbox unless running in production
    return process.env.NODE_ENV === 'production'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  // -------------------------------------------------------------------------
  // Private: OAuth token
  // -------------------------------------------------------------------------

  private async getAccessToken(): Promise<string> {
    const clientId = process.env.AP_PAYPAL_CLIENT_ID;
    const secret = process.env.AP_PAYPAL_CLIENT_SECRET;

    if (!clientId || !secret) {
      throw new Error('AP_PAYPAL_CLIENT_ID and AP_PAYPAL_CLIENT_SECRET are required');
    }

    const credentials = Buffer.from(`${clientId}:${secret}`).toString('base64');

    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
    });

    if (!res.ok) {
      throw new Error(`PayPal token request failed with status ${res.status}`);
    }

    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }

  // -------------------------------------------------------------------------
  // verifySignature
  // -------------------------------------------------------------------------

  /**
   * Verifies the PayPal webhook signature by calling PayPal's verification API.
   *
   * Returns `false` (not `true`) when `AP_PAYPAL_WEBHOOK_ID` is not configured,
   * so the controller will reject the request rather than silently accept it.
   */
  async verifySignature(
    headers: PaypalWebhookHeaders,
    rawBody: Buffer,
  ): Promise<boolean> {
    const webhookId = process.env.AP_PAYPAL_WEBHOOK_ID;

    if (!webhookId) {
      this.logger.warn(
        'AP_PAYPAL_WEBHOOK_ID is not set — signature verification refused',
      );
      return false;
    }

    let webhookEvent: unknown;
    try {
      webhookEvent = JSON.parse(rawBody.toString('utf-8'));
    } catch {
      this.logger.warn('PayPal webhook body is not valid JSON');
      return false;
    }

    try {
      const token = await this.getAccessToken();

      const res = await fetch(
        `${this.baseUrl}/v1/notifications/verify-webhook-signature`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transmission_id: headers['paypal-transmission-id'],
            transmission_time: headers['paypal-transmission-time'],
            cert_url: headers['paypal-cert-url'],
            auth_algo: headers['paypal-auth-algo'],
            transmission_sig: headers['paypal-transmission-sig'],
            webhook_id: webhookId,
            webhook_event: webhookEvent,
          }),
        },
      );

      if (!res.ok) {
        this.logger.error(
          `PayPal verify-webhook-signature returned ${res.status}`,
        );
        return false;
      }

      const data = (await res.json()) as { verification_status: string };
      return data.verification_status === 'SUCCESS';
    } catch (err) {
      this.logger.error('PayPal signature verification error', err);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // handleEvent
  // -------------------------------------------------------------------------

  /**
   * Dispatches a verified PayPal event to the appropriate handler.
   *
   * All handlers are no-ops in this scaffold slice — business logic is added
   * in billing-integration slices.
   */
  async handleEvent(
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    this.logger.log(`PayPal webhook received: ${eventType}`);

    switch (eventType) {
      case 'BILLING.SUBSCRIPTION.CREATED':
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
      case 'BILLING.SUBSCRIPTION.UPDATED':
      case 'BILLING.SUBSCRIPTION.EXPIRED':
      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
        // future: update ap_subscriptions row
        break;

      case 'PAYMENT.SALE.COMPLETED':
        // future: mark invoice as paid, grant credits
        break;

      case 'INVOICING.INVOICE.PAID':
        // future: mark invoice as paid
        break;

      case 'INVOICING.INVOICE.CANCELLED':
        // future: mark invoice as refunded/failed
        break;

      default:
        this.logger.debug(`Unhandled PayPal event type: ${eventType}`);
    }
  }
}
