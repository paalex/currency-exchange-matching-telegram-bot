import Telegraf from "telegraf";
import Markup from "telegraf/markup";
import Stage from "telegraf/stage";
import WizardScene from "telegraf/scenes/wizard";
import {storeUser, storeOffer, listMyOffers} from "./firebaseHelper";
import LocalSession from "telegraf-session-local";
import _ from 'lodash';
import {BUY, SELL, BYN, BUY_USD, BUY_EUR, SELL_USD, SELL_EUR,
  MINSK, GRODNO, BOBRUYSK, BARANOVICHI, LIST_OFFERS} from '../constants/appEnums';
import {MINSK_WORD, GRODNO_WORD, BOBRUYSK_WORD, BARANOVICHI_WORD,
  BUY_USD_WORD, BUY_EUR_WORD, SELL_USD_WORD, SELL_EUR_WORD} from '../constants/localizedStrings'

const {TELEGRAM_API_KEY} = process.env;
const bot = new Telegraf(TELEGRAM_API_KEY);
const {SERVER_URL} = process.env;

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
    isBot: user.is_bot || false,
    firstName: user.first_name || '',
    lastName: user.last_name || '',
    username: user.username,
    langCode: user.language_code || ''
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
  ],
  [
    Markup.callbackButton(`Список моих ставок`, LIST_OFFERS)
  ]
]).extra();


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

const getText = (ctx) => _.get(ctx, 'update.message.text')
const getUser = (ctx) => {
 return _.get(ctx.update, 'callback_query.from') || _.get(ctx.update, 'message.from');
}

const offerWizard = new WizardScene(
  "offer",
  ctx => {
    // console.log('ctx',ctx)
    saveUser(ctx);
    ctx.reply("Привет. Что будем делать? 🐰", initialMenu);
    return ctx.wizard.next();
  },
  async ctx => {
    if (!ctx.update.callback_query || getText(ctx) === '/start' || getText(ctx) === '/back') {
      return ctx.scene.reenter()
    }
    const choice = _.get(ctx.update, 'callback_query.data');
    if (choice === LIST_OFFERS) {
      const userId = _.get(getUser(ctx),'id');
      let offers;
      if (userId) {
        offers = await listMyOffers(userId).catch(e => console.log('listMyOffers', e));
        const offersText = await readableOffers(offers)
        ctx.reply(offersText || '');
      }
      return ctx.scene.reenter()
    }
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
    if (ctx.update.callback_query || getText(ctx) === '/start' || getText(ctx) === '/back') {
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
    if (ctx.update.callback_query || getText(ctx) === '/start' || getText(ctx) === '/back') {
      return ctx.scene.reenter()
    }
    ctx.wizard.state.rate = ctx.message.text;
    const {currencySource, currencyDestination, action} = ctx.wizard.state;
    const currency = action === SELL ? currencySource : currencyDestination;

    ctx.reply(
      `Понятно. ${ctx.wizard.state.rate} ${currency}-${BYN}.\n`
      + `В каком городе вы можете встретится?`,
      citiesButtons
    );
    return ctx.wizard.next();
  },
  ctx => {
    if (!ctx.update.callback_query || getText(ctx) === '/start' || getText(ctx) === '/back') {
      return ctx.scene.reenter()
    }
    ctx.wizard.state.city = ctx.update.callback_query.data;
    const {currencySource, currencyDestination, rate, amount, action, transactionType, city} = ctx.wizard.state;
    const currency = action === SELL ? currencySource : currencyDestination;
    console.log("ctx.wizard.state", ctx.wizard.state)
    const offer = ctx.wizard.state;
    const user = ctx.update.callback_query.from;
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
  const user = _.get(ctx, 'update.message.from') || _.get(ctx, 'update.callback_query.from');
  const processedUser = processTelegramUser(user);
  if (!processedUser.isBot && processedUser) {
    storeUser(processedUser);
  }
}

export function botInit(expressApp) {
  bot.telegram.setWebhook(`${SERVER_URL}/bot${TELEGRAM_API_KEY}`).catch(e => console.warn('telegram.setWebhook err', e));
  expressApp.use(bot.webhookCallback(`/bot${TELEGRAM_API_KEY}`));
  // Scene registration
  bot.use((new LocalSession({database: '.data/telegraf_db.json'})).middleware())
  // bot.use(session());
  bot.use(stage.middleware());
  bot.start(async ctx => {
    saveUser(ctx);
    ctx.scene.enter("offer");
  });
  bot.action("back", async ctx => {
    await ctx.scene.reenter().catch(e => {
      console.warn('back reenter err', e)
      ctx.scene.enter("offer").catch(e => {
        console.warn('back enter err', e)
      });
    });
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

  bot.help(ctx => ctx.reply("Send me a sticker"));
  bot.on("sticker", ctx => ctx.reply("👍"));
  bot.hears("hi", ctx => ctx.reply("Hey there"));
  /*
   your bot commands and all the other stuff on here ....
  */
  // bot.launch();
  // bot.telegram.setWebhook(`${HEROKU_URL}${TELEGRAM_API_KEY}`)
  // // Http webhook, for nginx/heroku users.
  // bot.startWebhook(`/${TELEGRAM_API_KEY}`, null, PORT)
}

export async function readableOffers(offers) {
  return _.reduce(offers, (acc, offer) => {
    const { action, amount, city, currencyDestination, currencySource, rate } = offer;
    const currency = action === BUY ? currencyDestination : currencySource;
    const text = `${action} ${amount} ${currency} @${rate} в г.${getCityWord(city)}` + '\n';
    return acc + text
  }, "")
}
