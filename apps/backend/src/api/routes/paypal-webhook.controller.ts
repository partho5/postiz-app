import {
  Controller,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PaypalWebhookService } from '@gitroom/autopilot/webhooks/paypal';

/**
 * Public endpoint that receives PayPal webhook notifications.
 *
 * Route: POST /autopilot/paypal/webhook
 *
 * NOT in the `authenticatedController` list — PayPal calls this without
 * user auth. Signature verification provides authenticity.
 */
@ApiTags('Autopilot / PayPal Webhook')
@Controller('/autopilot/paypal')
export class PaypalWebhookController {
  private readonly logger = new Logger(PaypalWebhookController.name);

  constructor(
    private readonly _paypalWebhookService: PaypalWebhookService,
  ) {}

  @Post('/webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('paypal-transmission-id') transmissionId: string,
    @Headers('paypal-transmission-time') transmissionTime: string,
    @Headers('paypal-cert-url') certUrl: string,
    @Headers('paypal-auth-algo') authAlgo: string,
    @Headers('paypal-transmission-sig') transmissionSig: string,
  ) {
    const rawBody = req.rawBody;

    if (!rawBody) {
      throw new HttpException('Missing raw body', HttpStatus.BAD_REQUEST);
    }

    const valid = await this._paypalWebhookService.verifySignature(
      {
        'paypal-transmission-id': transmissionId,
        'paypal-transmission-time': transmissionTime,
        'paypal-cert-url': certUrl,
        'paypal-auth-algo': authAlgo,
        'paypal-transmission-sig': transmissionSig,
      },
      rawBody,
    );

    if (!valid) {
      this.logger.warn('Rejected PayPal webhook: signature invalid');
      throw new HttpException('Invalid signature', HttpStatus.UNAUTHORIZED);
    }

    let event: { event_type?: string; [key: string]: unknown };
    try {
      event = JSON.parse(rawBody.toString('utf-8'));
    } catch {
      throw new HttpException('Invalid JSON body', HttpStatus.BAD_REQUEST);
    }

    await this._paypalWebhookService.handleEvent(
      event.event_type ?? 'UNKNOWN',
      event,
    );

    return { ok: true };
  }
}
