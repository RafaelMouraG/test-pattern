import { CheckoutService } from '../src/services/CheckoutService.js';
import { Item } from '../src/domain/Item.js';
import { Pedido } from '../src/domain/Pedido.js';
import { UserMother } from './builders/UserMother.js';
import { CarrinhoBuilder } from './builders/CarrinhoBuilder.js';

const CARTAO = { numero: '4111111111111111', cvv: '123' };

describe('CheckoutService', () => {
    describe('quando o pagamento falha', () => {
        let gatewayStub;
        let repositoryDummy;
        let emailDummy;
        let pedido;

        beforeEach(async () => {
            // Arrange
            const carrinho = CarrinhoBuilder.umCarrinho().build();
            gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: false }) };
            repositoryDummy = { salvar: jest.fn() };
            emailDummy = { enviarEmail: jest.fn() };
            const checkoutService = new CheckoutService(gatewayStub, repositoryDummy, emailDummy);

            // Act
            pedido = await checkoutService.processarPedido(carrinho, CARTAO);
        });

        it('deve retornar null (verificação de estado)', () => {
            // Assert
            expect(pedido).toBeNull();
        });

        it('não deve salvar o pedido nem enviar e-mail', () => {
            // Assert
            expect(repositoryDummy.salvar).not.toHaveBeenCalled();
            expect(emailDummy.enviarEmail).not.toHaveBeenCalled();
        });
    });

    describe('quando um cliente Padrão finaliza a compra', () => {
        it('deve retornar o pedido salvo com o totalFinal sem desconto', async () => {
            // Arrange
            const carrinho = CarrinhoBuilder.umCarrinho()
                .comUser(UserMother.umUsuarioPadrao())
                .comItens([new Item('Teclado', 150), new Item('Mouse', 50)])
                .build();
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            const repositoryStub = {
                salvar: jest.fn().mockImplementation(async (p) =>
                    new Pedido(42, p.carrinho, p.totalFinal, p.status)),
            };
            const emailDummy = { enviarEmail: jest.fn().mockResolvedValue(undefined) };
            const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailDummy);

            // Act
            const pedido = await checkoutService.processarPedido(carrinho, CARTAO);

            // Assert
            expect(pedido).toBeInstanceOf(Pedido);
            expect(pedido.id).toBe(42);
            expect(pedido.totalFinal).toBe(200);
            expect(pedido.status).toBe('PROCESSADO');
        });
    });

    describe('quando um cliente Premium finaliza a compra', () => {
        let gatewayStub;
        let repositoryStub;
        let emailMock;
        let pedido;

        beforeEach(async () => {
            // Arrange
            const usuarioPremium = UserMother.umUsuarioPremium();
            const carrinho = CarrinhoBuilder.umCarrinho()
                .comUser(usuarioPremium)
                .comItens([new Item('Fone', 120), new Item('Capa', 80)]) // R$ 200,00
                .build();
            gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            repositoryStub = {
                salvar: jest.fn().mockResolvedValue(new Pedido(99, carrinho, 180, 'PROCESSADO')),
            };
            emailMock = { enviarEmail: jest.fn().mockResolvedValue(undefined) };
            const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailMock);

            // Act
            pedido = await checkoutService.processarPedido(carrinho, CARTAO);
        });

        it('deve cobrar o valor com 10% de desconto no gateway', () => {
            // Assert
            expect(gatewayStub.cobrar).toHaveBeenCalledWith(180, CARTAO);
        });

        it('deve enviar um e-mail de confirmação com os dados corretos', () => {
            // Assert (verificação de comportamento)
            expect(emailMock.enviarEmail).toHaveBeenCalledTimes(1);
            expect(emailMock.enviarEmail).toHaveBeenCalledWith(
                'premium@email.com',
                'Seu Pedido foi Aprovado!',
                'Pedido 99 no valor de R$180'
            );
        });

        it('deve retornar o pedido salvo', () => {
            // Assert
            expect(pedido.id).toBe(99);
            expect(pedido.totalFinal).toBe(180);
        });
    });

    describe('quando o envio de e-mail falha', () => {
        it('não deve quebrar o checkout e deve retornar o pedido salvo', async () => {
            // Arrange
            const carrinho = CarrinhoBuilder.umCarrinho().build();
            const pedidoSalvo = new Pedido(7, carrinho, 100, 'PROCESSADO');
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            const repositoryStub = { salvar: jest.fn().mockResolvedValue(pedidoSalvo) };
            const emailStub = { enviarEmail: jest.fn().mockRejectedValue(new Error('SMTP fora do ar')) };
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailStub);

            // Act
            const pedido = await checkoutService.processarPedido(carrinho, CARTAO);

            // Assert
            expect(pedido).toBe(pedidoSalvo);
            consoleSpy.mockRestore();
        });
    });
});
