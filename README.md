# ⚽ WoMGR

Gerenciador de times para peladas e futebol recreativo. Cole a lista do grupo do WhatsApp, registre a presença com horário de chegada e sorteie os times — tudo com as regras certas: **quem chegou primeiro, joga primeiro.**

![React](https://img.shields.io/badge/React-18+-61DAFB?style=flat-square&logo=react&logoColor=black)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2021-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Zero deps](https://img.shields.io/badge/dependências_externas-zero-ff6b1a?style=flat-square)

---

## ✨ Funcionalidades

### 📋 Parser de Lista Inteligente
Aceita o formato padrão de listas de grupo de WhatsApp, com suporte a:
- Cabeçalho `LISTA-FUTEBOL W.O -DD/MM`
- Seção de jogadores numerados
- Seção `GOLEIROS` separada
- Seção `AUSENTES` com emojis de justificativa (✈️ 🚑 👨‍💻 etc.)
- Ignora linhas vazias automaticamente

**Exemplo de entrada:**
```
LISTA-FUTEBOL W.O -28 / 03

1 ...
2 ...
3 ...
...
16 ...

GOLEIROS
1 ...
2 ...

AUSENTES
1 ...
2 ...
```

### ✅ Registro de Presença com Timestamp
- Marque cada jogador com um clique no momento em que ele chega
- Horário de chegada registrado automaticamente com precisão de segundos
- Badge em tempo real indicando status: **TITULAR**, **FILA #N** ou **ATRASADO**
- Configuração do horário de kickoff para separar quem chegou no prazo de quem se atrasou

### ⚽ Sorteio de Times com Regras Justas

| Regra | Comportamento |
|-------|--------------|
| **Prioridade de jogo** | Os primeiros `N × vagas_por_time` a chegar são os titulares |
| **Sorteio** | Dentro do grupo titular, os times são definidos aleatoriamente |
| **Goleiros** | Não entram no sorteio — o 1° goleiro vai pro Time A, o 2° pro Time B... |
| **Fila de entrada** | Quem ficou fora entra na ordem de chegada (FIFO) |
| **Atrasados** | Chegaram após o kickoff → ficam de fora do jogo em andamento e entram no final da fila |

Suporte para **2, 3 ou 4 times** com número configurável de jogadores por time.

---

## 🚀 Como usar

### Pré-requisitos
- Node.js 18+
- Um projeto React (Vite, Create React App, etc.)

### Instalação

```bash
# Clone o repositório
git clone https://github.com/idemar-neto/wo-mgr.git
cd wo-mgr

# Instale as dependências
npm install

# Inicie o servidor de desenvolvimento
npm run dev
```

### Como rodar como componente isolado

O `wo-mgr.jsx` é um componente **self-contained** — sem dependências externas além do React. Basta copiar o arquivo para qualquer projeto React:

```jsx
// App.jsx
import WoManager from './WoManager'

export default function App() {
  return <WoManager />
}
```

---

## 🗂️ Estrutura do Projeto

```
wo-mgr/
├── src/
│   ├── wo-mgr.jsx   # Componente principal (self-contained)
│   └── main.jsx # Componente main
├── public/
│   ├── manifest.webmanifest
│   ├── pwa-192x192.png
│   ├── pwa-512x512.png
│   └── favicon.ico
├── index.html
├── package.json
└── README.md
```

O componente é organizado em seções bem definidas:

```
wo-mgr.jsx
├── PARSER          — parseList(), stripEmoji(), extractEmoji()
├── TEAM LOGIC      — buildTeams(), TEAM_META
├── CSS             — estilos injetados via <style> (Anton + Outfit)
├── TOAST           — hook useToast()
└── APP             — componente principal com 3 abas
```

---

## 🎮 Fluxo de uso

```
1. Aba "Lista"
   └── Cole a lista do grupo → clique em "Processar Lista"

2. Aba "Presença"
   ├── Configure o horário de kickoff (opcional)
   ├── Clique "Chegou ✓" para cada jogador conforme chegam
   └── Acompanhe os badges: TITULAR / FILA #N / ATRASADO

3. Aba "Times"
   ├── Escolha nº de times e jogadores por time
   ├── Clique "Sortear Times"
   └── Veja: titulares (sorteados) · fila de entrada · atrasados
```

---

## 🧠 Lógica de Sorteio (detalhada)

```
Todos os presentes ordenados por horário de chegada (crescente)
              │
              ▼
  ┌─────────────────────────────┐
  │  Primeiros N×vagas jogadores │  → Pool de titulares
  │  (chegaram antes ou no kickoff)│    └─ Shuffled aleatoriamente
  └─────────────────────────────┘        └─ Distribuídos nos times
              │
  ┌─────────────────────────────┐
  │  Restantes (chegaram depois) │  → Fila de entrada (FIFO)
  └─────────────────────────────┘
              │
  ┌─────────────────────────────┐
  │  Chegaram após o kickoff     │  → Final da fila (atrasados)
  └─────────────────────────────┘

Goleiros (sempre separados):
  1° goleiro presente → Time A
  2° goleiro presente → Time B
  ...
  Demais → Banco de goleiros
```

---

## 🎨 Design

- Tema **laranja e preto** estilo placar de estádio
- Fontes: **Anton** (display) + **Outfit** (corpo)
- CSS-in-JS via template literal — sem dependência de biblioteca de estilos
- Layout responsivo para mobile e desktop
- Feedback visual em tempo real com badges de status e toasts

---

## 📄 Licença

MIT — faça bom uso e que venha muita pelada boa. ⚽
