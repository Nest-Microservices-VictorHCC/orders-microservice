import { IsEnum, IsOptional } from "class-validator";
import { OrderStatusList, } from "../enum/order.enum";
import { PaginationDto } from "src/common";
import { OrderStatus } from "generated/prisma";

export class OrderPaginationDto extends PaginationDto {

  @IsOptional()
  @IsEnum(OrderStatusList, {
    message: `Valid status are ${OrderStatusList.join(', ')}`,
  })
  status: OrderStatus
}