import Telegraf from "telegraf";
import Markup from "telegraf/markup";
import Stage from "telegraf/stage";
import session from "telegraf/session";
import WizardScene from "telegraf/scenes/wizard";
import { storeUser, storeOffer } from "./firebaseHelper";
import LocalSession from "telegraf-session-local";
import _ from 'lodash';

const BUY = "BUY";
const SELL = "SELL";
const USD = "USD";
const EUR = "EUR";
const BYN = "BYN";
const BUY_USD = `${BUY}_${USD}`;
const BUY_EUR = `${BUY}_${EUR}`;
const SELL_USD = `${SELL}_${USD}`;
const SELL_EUR = `${SELL}_${EUR}`;
const MINSK = "MINSK";
const GRODNO = "GRODNO";
const BOBRUYSK = "BOBRUYSK";
const BARANOVICHI = "BARANOVICHI";

const MINSK_WORD = "Минск";
const GRODNO_WORD = "Гродно";
const BOBRUYSK_WORD = "Бобруйск";
const BARANOVICHI_WORD = "Барановичи";


const BUY_USD_WORD = "купить USD";
const BUY_EUR_WORD = "купить EUR";
const SELL_USD_WORD = "продать USD";
const SELL_EUR_WORD = "продать EUR";

function getCityWord(city) {
  let word;
  switch (city) {
    case MINSK:
      word = MINSK_WORD;
      break;
    case GRODNO:
      word = GRODNO_WORD;
      break;
    case BOBRUYSK:
      word = BOBRUYSK_WORD;
      break;
    case BARANOVICHI:
      word = BARANOVICHI_WORD;
      break;
  }
  return word;
}

function getActionPhrase(action) {
  let word;
  switch (action) {
    case BUY_USD:
      word = BUY_USD_WORD;
      break;
    case BUY_EUR:
      word = BUY_EUR_WORD;
      break;
    case SELL_USD:
      word = SELL_USD_WORD;
      break;
    case SELL_EUR:
      word = SELL_EUR_WORD;
      break;
  }
  return word;
}

function processTelegramUser(user) {
  return {
    id: user.id,
    isBot: user.is_bot,
    firstName: user.first_name,
    lastName: user.last_name,
    username: user.username,
    langCode: user.language_code
  };
}

const initialMenu = Markup.inlineKeyboard([
  [
    Markup.callbackButton(`${BUY_USD_WORD} $`, BUY_USD),
    Markup.callbackButton(`${BUY_EUR_WORD} €`, BUY_EUR)
  ],
  [
    Markup.callbackButton(`${SELL_USD_WORD} $`, SELL_USD),
    Markup.callbackButton(`${SELL_EUR_WORD} €`, SELL_EUR)
  ]
]).extra();

const bot = new Telegraf(process.env.TELEGRAM_API_KEY);

const citiesButtons = Markup.inlineKeyboard([
  [
    Markup.callbackButton(MINSK_WORD, MINSK),
    Markup.callbackButton(GRODNO_WORD, GRODNO)
  ],
  [
    Markup.callbackButton(BOBRUYSK_WORD, BOBRUYSK),
    Markup.callbackButton(BARANOVICHI_WORD, BARANOVICHI),
  ]
]).extra();

const offerWizard = new WizardScene(
  "offer",
  ctx => {
    // console.log('ctx',ctx)
    saveUser(ctx);
    ctx.reply("Привет. Что будем делать? 🐰", initialMenu);
    return ctx.wizard.next();
  },
  ctx => {
    console.log('ctx.update',ctx.update)
    if (!ctx.update.callback_query || _.get(ctx, 'update.message.text') === '/start') {
      ctx.scene.reenter()
      return
    }
    const choice = ctx.update.callback_query.data;
    if (choice) {
      const currency = choice.split('_')[1]
      const chosenAction = choice.split('_')[0]
      ctx.wizard.state.currencySource = chosenAction === BUY ? BYN : currency
      ctx.wizard.state.currencyDestination = chosenAction === SELL ? BYN : currency;
      ctx.wizard.state.action = chosenAction;
      ctx.wizard.state.transactionType = choice;
      if (currency) {
        let phrase = getActionPhrase(choice);
        if (phrase) {
          ctx.reply(
            `Понятно, ${phrase}. Сколько ${currency}?`
          );
          return ctx.wizard.next();
        }
      }
    }
  },
  ctx => {
    console.log('ctx.update',ctx.update)
    if (ctx.update.callback_query || _.get(ctx, 'update.message.text') === '/start') {
      return ctx.scene.reenter()
    }
    ctx.wizard.state.amount = ctx.message.text;
    const {amount, currencySource, currencyDestination, action} = ctx.wizard.state;
    const currency = action === SELL ? currencySource : currencyDestination;
    ctx.reply(
      `🐰 Ок. ${amount} ${currency}. По какому курсу?`
    );
    return ctx.wizard.next();
  },
  ctx => {
    console.log('ctx.update',ctx.update)
    if (ctx.update.callback_query || _.get(ctx, 'update.message.text') === '/start') {
      ctx.scene.reenter()
      return
    }
    ctx.wizard.state.rate = ctx.message.text;
    const {amount, currencySource, currencyDestination, action} = ctx.wizard.state;
    const currency = action === SELL ? currencySource : currencyDestination;

    ctx.reply(
      `Понятно. ${ctx.wizard.state.rate} ${currency}-${BYN}.\n` 
      + `В каком городе вы можете встретится?`,
      citiesButtons
    );
    return ctx.wizard.next();
  },
  ctx => {
    console.log('ctx.update',ctx.update)
    if (!ctx.update.callback_query || _.get(ctx, 'update.message.text') === '/start') {
      ctx.scene.reenter()
      return
    }
    ctx.wizard.state.city = ctx.update.callback_query.data;
    const {currencySource, currencyDestination, rate, amount, action, transactionType, city} = ctx.wizard.state;
    const currency = action === SELL ? currencySource : currencyDestination;
    console.log("ctx.wizard.state", ctx.wizard.state)
    const offer = ctx.wizard.state;
    const user = ctx.update.callback_query.from;
    const actionPhrase = getActionPhrase(transactionType);
    const cityWord = getCityWord(city);
    const invalid = !amount || !currency || !rate || !cityWord;
    if (!invalid) {
      storeOffer(user, offer)
      const partnerWord = action === SELL ? 'покупателя' : 'продавца';
      const actionWord = action === SELL ? 'продать' : 'купить';
      ctx.reply(
        `Итак, вы готовы ${actionWord}:\n` 
        + `${amount} ${currency} по курсу ${rate} ${currency}-${BYN} в городе ${cityWord}.\n\n`
        + `Как только найду вам ${partnerWord}, сообщу 🐰`,
        Markup.inlineKeyboard([
          Markup.callbackButton("Начать новый обмен  ↩️", "back"),
        ]).extra()
      );
      return ctx.scene.leave();
    }
    return ctx.scene.reenter()
  }
);
const stage = new Stage([offerWizard]);

function saveUser(ctx) {
  const user = ctx.update.message.from;
  const processedUser = processTelegramUser(user);
  if (!processedUser.isBot) {
    storeUser(processedUser);
  }
}

export function botInit() {
    // Scene registration
  bot.use((new LocalSession({ database: '.data/telegraf_db.json' })).middleware())
  // bot.use(session());
  bot.use(stage.middleware());
  bot.start(async ctx => {
    saveUser(ctx);
    ctx.scene.enter("offer");
  });
  bot.action("back", ctx => {
    ctx.scene.enter("offer");
  });

//   bot.on("callback_query", ctx => {
//     const cbQuery = ctx.update.callback_query;
//     console.log(cbQuery);
//     const action = cbQuery.data;
//     const msg = cbQuery.message;
//     const opts = {
//       chat_id: msg.chat.id,
//       message_id: msg.message_id
//     };
//     let text;

//     switch (action) {
//       case "buy_eur_100":
//         text = "Вы выбрали купить €100";
//         break;
//       case BUY_EUR:
//         text = "Вы выбрали купить EUR";
//         buyEUR(ctx);
//         break;
//     }
//     console.log(action);
//     // if (text) ctx.editMessageText(text, opts);
//     if (text) ctx.reply(text);
//   });

  bot.help(ctx => ctx.reply("Send me a sticker"));
  bot.on("sticker", ctx => ctx.reply("👍"));
  bot.hears("hi", ctx => ctx.reply("Hey there"));
  bot.launch();
}