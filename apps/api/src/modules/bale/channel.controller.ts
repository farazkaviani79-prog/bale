import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Auth, TenantId } from '../../auth/auth.decorators';
import { MinRole } from '../../auth/auth.guard';
import { AuthContext } from '../../auth/auth.types';
import { ChannelService } from './channel.service';
class ConnectDto { @IsString() storeId!: string; @IsString() @MinLength(10) @MaxLength(200) botToken!: string; }
class PaymentTokenDto { @IsString() storeId!: string; @IsString() @MaxLength(300) providerToken!: string; }
@Controller('channels')
export class ChannelController {
  constructor(private readonly svc: ChannelService) {}
  @Get() list(@TenantId() t: string) { return this.svc.list(t); }
  @MinRole('ADMIN') @Put('bale/payment-token') setPay(@TenantId() t: string, @Auth() a: AuthContext, @Body() d: PaymentTokenDto) { return this.svc.setPaymentToken(t, a.userId, d.storeId, d.providerToken); }
  @MinRole('ADMIN') @Post('bale') connect(@TenantId() t: string, @Auth() a: AuthContext, @Body() d: ConnectDto) { return this.svc.connectBale(t, a.userId, d.storeId, d.botToken); }
}
