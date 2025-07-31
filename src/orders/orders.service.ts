import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { PrismaClient } from 'generated/prisma';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto';
import { NATS_SERVICE, PRODUCT_SERVICE } from 'src/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {

  constructor(
    @Inject(NATS_SERVICE) private readonly client: ClientProxy,
  ) {
    super();
  }

  private readonly logger = new Logger('OrdersService');

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected successfully');
  }
  
  async create(createOrderDto: CreateOrderDto) {
    
    try {

      // Validate product IDs in the order items
      const productIds = createOrderDto.items.map(item => item.productId);
      const products: any[] = await firstValueFrom(
        this.client.send({ cmd: 'validate_products' }, productIds)
      );

      // Calculate total amount and total items
      const totalAmount = createOrderDto.items.reduce((sum, item) => {
        const price = products.find(product => product.id === item.productId)?.price || 0;

        return price * item.quantity + sum;
      }, 0);

      const totalItems = createOrderDto.items.reduce((sum, item) => sum + item.quantity, 0);

      // create db order
      const order = await this.order.create({
        data: {
          totalAmount,
          totalItems,
          orderItems: {
            createMany: {
              data: createOrderDto.items.map(item => ({
                productId: item.productId,
                quantity: item.quantity,
                price: products.find(product => product.id === item.productId)?.price || 0,
              })),
            }
          }
        },
        include: {
          orderItems: {
            select: {
              productId: true,
              quantity: true,
              price: true,
            }
          }
        }
      })

      return {
        ...order,
        orderItems: order.orderItems.map(item =>({
          ...item,
          name: products.find(product => product.id === item.productId)?.name || 'Unknown Product',
        }))
      }

    } catch (error) {
      throw new RpcException({
        status: HttpStatus.BAD_REQUEST,
        message: error.message || 'Error validating products',
      })
    }

    
    // return this.order.create({
    //   data: createOrderDto,
    // });
  }

  async findAll(orderPaginationDto: OrderPaginationDto) {
    const totalPages = await this.order.count({
      where: {
        status: orderPaginationDto.status,
      }
    })

    const currentPage = orderPaginationDto.page;
    const perPage = orderPaginationDto.limit;

    return {
      data: await this.order.findMany({
        skip: (currentPage - 1) * perPage,
        take: perPage,
        where: {
          status: orderPaginationDto.status
        }
      }),
      meta: {
        total: totalPages,
        page: currentPage,
        lastPage: Math.ceil(totalPages / perPage),
      }
    }
  }

  async findOne(id: string) {

    const order = await this.order.findUnique({
      where: { id },
      include: {
        orderItems: {
          select: {
            productId: true,
            quantity: true,
            price: true,
          }
        }
      }
    });

    if(!order) {
      throw new RpcException({ 
        status: HttpStatus.NOT_FOUND, 
        message: `Order with id ${id} not found` 
      });
    }

    const productsIds = order.orderItems.map(item => item.productId);
    const products: any[] = await firstValueFrom(
      this.client.send({ cmd: 'validate_products' }, productsIds)
    );

    return {
      ...order,
      orderItems: order.orderItems.map(item => ({
        ...item,
        name: products.find(product => product.id === item.productId)?.name || 'Unknown Product',
      }))
    };
  }

  async changeStatus(updateOrderDto: UpdateOrderDto) {
    // const  { id, status } = updateOrderDto;

    // const order = await this.findOne(id);

    // if(order.status === status) {
    //   return order;
    // }

    // return this.order.update({
    //   where: { id },
    //   data: { status },
    // });
  }
}
