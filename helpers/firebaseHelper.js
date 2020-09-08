import admin from "firebase-admin";
import _ from 'lodash';
import {config as dotenv_config} from "dotenv"
import {BUY, MINSK} from "../constants/appEnums"
import {destructTransType, getTransType, isMatching, oppositeAction} from "./currencyHelper"
dotenv_config()

const parsedServiceAccount = process.env.FIREBASE_CONFIG_JSON
  ? JSON.parse(process.env.FIREBASE_CONFIG_JSON)
  : require("../.data/fb-service-account.json");
admin.initializeApp({
  credential: admin.credential.cert(parsedServiceAccount),
  databaseURL: process.env.FIREBASE_DB_URL
});

var db = admin.database().ref('server');

var usersRef = db.child("users");
var offersRef = db.child("offers");
// var offersRef = db.child("offers");

// usersRef.set({paalex: {name: 'Alex', telegramId: '@paalex505'}}, function(error) {
//   if (error) {
//     console.log("Data could not be saved." + error);
//   } else {
//     console.log("Data saved successfully.");
//   }
// });
// usersRef.update({paalex: {name: 'Alex', telegramId: '@paalex505'}}}
// atomic update
// usersRef.update({
//   "alanisawesome/nickname": "Alan The Machine",
//   "gracehop/nickname": "Amazing Grace"
// });

export async function storeUser(user) {
  if (!user) throw new Error('no user to save');
  const userRef = usersRef.child(user.id);
  const snapshot = await userRef.once('value');
  console.log(snapshot.val());
  return new Promise((res, rej) => {
    if (!snapshot.val()) {
      userRef.set(user, function(error) {
        if (error) {
          console.log("User could not be saved." + error);
          rej(error)
        } else {
          console.log("User saved successfully.");
        }
      });
    } else {
      userRef.update({...user}, function(error) {
        if (error) {
          console.log("User could not be saved." + error);
          rej(error)
        } else {
          console.log("User updated successfully.");

        }
      });
    }

  })
}

export async function storeOffer(user, offer) {
  const {action, city, currency} = offer;
  const {id: userId} = user;
  if (!user) throw new Error('no user to save');
  const offerPath = `offers/${city}/${currency}/${action}`;
  const userOffersPath = `users/${userId}/offers`;
  const offerUid = db.child(offerPath).push().key;
  const userOfferPath = `${userOffersPath}/${offerUid}`;
  const offerPathWithUid = `${offerPath}/${offerUid}`;
  return new Promise((res, rej) => {
    db.update({
      [offerPathWithUid]: {...offer, id: offerUid, userId},
      [userOfferPath]: {city, action, currency}
    },function(error) {
      if (error) {
        console.log("User could not be saved." + error);
        rej(error)
      } else {
        console.log("User saved successfully.");
      }
    });
  })
}

const parseUserOffers = (offers) => {
  return _.map(offers, (offer, id) => {
    return {...offer, id}
  })
}

async function fetchOffer(offer) {
  const {city, action, id, currency} = offer;
  const offerPath = `${city}/${currency}/${action}/${id}`;
  const snap = await offersRef.child(offerPath).once('value');
  return snap.val()
}

export async function listMyOffers(userId) {
  const myOffersPath = `${userId}/offers`;
  const myOffersRef = usersRef.child(myOffersPath);
  const snapshot = await myOffersRef.once('value');
  const userOffers = parseUserOffers(snapshot.val());
  const promises = _.map(userOffers, async userOffer => await fetchOffer(userOffer))
  return promises && promises.length > 0 ? await Promise.all(promises) : []
}

async function fetchCurrencyOffers({city, currency, action}) {
  const offersPath = `${city}/${currency}/${action}`;
  const snap = await offersRef.child(offersPath).once('value');
  return snap.val()
}

export async function listPotentialMatches(user) {
  const {id: userId} = user;
  const myOffers = await listMyOffers(userId);
  if (myOffers) {
    const city = user.city || myOffers[0].city || MINSK;
    const desiredTransactionTypes = _.reduce(myOffers, (acc, offer) => {
      const {currency, action} = offer;
      const transType = getTransType({currency, action});
      return acc[transType] ? acc : {...acc, [transType]: transType}
    }, {})
    const potentialMatchingOffersPromises = _.map(desiredTransactionTypes, async transType => {
      const {currency, action} = destructTransType(transType)
      const offers = await fetchCurrencyOffers({city, currency, action})
      return {[currency]: {[action]: offers}}
    })
    const relevantOffersArr = await Promise.all(potentialMatchingOffersPromises);
    const relevantOffersCollection = _.reduce(relevantOffersArr, (acc, currencyOffers) => {
      return {...acc, ...currencyOffers }
    },{})

    return findMatches({relevantOffersCollection, myOffers, userId});
  }
  return []
  // const cities = _.reduce(myOffers, (acc, offer) => {
  //   const {city} = offer;
  //   return acc[city] ? acc : {...acc, [city]: city}
  // }, {})
  // const myOffersPath = `${userId}/offers`;
  // const myOffersRef = usersRef.child(myOffersPath);
  // const snapshot = await myOffersRef.once('value');
  // const userOffers = parseUserOffers(snapshot.val());
  // const promises = _.map(userOffers, async userOffer => await fetchOffer(userOffer))
  // return await Promise.all(promises);
}

function findMatches({relevantOffersCollection, myOffers, userId}) {
  let potentialMatches = [];
  _.forEach(myOffers, myOffer => {
    const {action, currency} = myOffer;
    const potentialOffers = relevantOffersCollection[currency][oppositeAction(action)];
    _.forEach(potentialOffers, offer => {
      if (offer.userId !== userId && isMatching(myOffer, offer)) {
        potentialMatches.push(offer)
      }
    })
  })
  return potentialMatches
}
