import admin from "firebase-admin";
import _ from 'lodash';
import {config as dotenv_config} from "dotenv"
import {BUY} from "../constants/appEnums"
dotenv_config()

const parsedServiceAccount = process.env.FIREBASE_CONFIG_JSON
  ? JSON.parse(process.env.FIREBASE_CONFIG_JSON)
  : require("../.data/fb-service-account.json");
console.log('process.env.FIREBASE_DB_URL',process.env.FIREBASE_DB_URL)
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
  const {action, city} = offer;
  if (!user) throw new Error('no user to save');
  const offerPath = `offers/${city}/${action}`;
  const userOffersPath = `users/${user.id}/offers`;
  const offerUid = db.child(offerPath).push().key;
  const userOfferPath = `${userOffersPath}/${offerUid}`;
  const offerPathWithUid = `${offerPath}/${offerUid}`;
  return new Promise((res, rej) => {
    db.update({
      [offerPathWithUid]: offer,
      [userOfferPath]: {city, action}
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
  return _.map(offers, (offer, id) => ({...offer, id}))
}

async function fetchOffer(offer) {
  const {city, action, id} = offer;
  const offerPath = `${city}/${action}/${id}`;
  const snap = await offersRef.child(offerPath).once('value');
  return snap.val()
}

export async function listMyOffers(userId) {
  const myOffersPath = `${userId}/offers`;
  const myOffersRef = usersRef.child(myOffersPath);
  const snapshot = await myOffersRef.once('value');
  const userOffers = parseUserOffers(snapshot.val());
  const promises = _.map(userOffers, async userOffer => await fetchOffer(userOffer))
  return await Promise.all(promises);
}

