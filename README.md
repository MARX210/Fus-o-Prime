# Fusão Prime

**Que herói nasce da sua fusão?**

Jogo de ação para celular e computador. O jogador combina dois poderes, um **núcleo** e uma **essência**, e cria um herói com ataques, habilidades, forças e fraquezas próprias. São 18 poderes e 153 fusões. A história se passa em 3 capítulos contra o Consórcio Sol Negro, com mini chefes, chefes e um Modo Infinito.

Uma produção **MV_NEXUS**, por Marx Vinicius Gama Vieira Bispo.

> Versão de teste: o progresso fica salvo só no navegador de cada jogador (localStorage). Ainda não há banco de dados nem contas.

## O que tem nesta versão

- Escolha de visual 2D ou 3D na primeira abertura, com recomendação feita por um teste de desempenho do aparelho
- Abertura com o vídeo MV_NEXUS e tela-título animada
- Laboratório de fusão com 18 poderes, 153 combinações e prévia do herói
- Arena com controles de toque (direcional e botões) e de teclado
- 3 capítulos, cada um com 6 ondas, mini chefe e chefe com 3 fases
- Inimigos com golpes próprios (pavio de fogo, investida, fitas de escudo, salto, correnteza, feixe refletido, fio orbital e muralha de âmbar)
- Evolução até o nível 30 e além, pontos de atributo, equipamentos, melhorias, skins, missões, conquistas e Modo Infinito
- Tutorial de combate e um guia que aparece na primeira visita a cada tela
- Música por fase, efeitos sonoros, sons próprios para cada poder e locução em português do Brasil (voz do próprio aparelho)

## Controles

| Ação | Toque | Teclado |
|---|---|---|
| Mover | Direcional à esquerda | WASD ou setas |
| Atacar | ATACAR (segure) | J |
| Esquivar | ESQ | Shift |
| Pular | PUL | Espaço |
| Defender | DEF (segure) | E |
| Habilidade I / II | ESP I / ESP II | K / L |
| Supremo | SUP | U |
| Pausar | Pausar | P |

## Rodar no computador

O jogo é um site estático. Os sons são carregados da pasta `audio/`, então é preciso abrir por um servidor local (abrir o `index.html` direto com dois cliques funciona, mas fica sem música e efeitos gravados).

```bash
python -m http.server 8000
```

Depois abra `http://localhost:8000` no navegador.

## Publicar

O jogo está no ar em **https://fusao-prime.vercel.app**. O projeto na Vercel está ligado a este repositório: cada envio para a `main` atualiza o site em cerca de um minuto.

### Vercel
Importe o repositório em vercel.com como projeto estático, sem comando de build e com a pasta raiz como saída. O `vercel.json` já define cache para os sons e ícones.

## Modo de desenvolvimento

Adicione `?dev` ao endereço para ver o **modo teste** na tela de Evolução, que pula direto para qualquer nível. Ele fica escondido para os jogadores.

## Estrutura

```
index.html             jogo completo (HTML, CSS e JavaScript)
audio/                 músicas e efeitos (mp3)
icons/                 ícones do app
manifest.webmanifest   permite adicionar à tela inicial do celular
og.jpg                 imagem de prévia ao compartilhar o link
CREDITS.md             créditos e licenças dos sons
```

## Créditos

Veja [CREDITS.md](CREDITS.md). Todos os sons e músicas de terceiros são de domínio público (CC0).
