import axios, { AxiosError, AxiosResponse } from "axios";
import schedule from 'node-schedule';
import fs from 'fs';

const titles = ["BROADCASTER", "VIP", "MOD", "Staff", "Admin", "Global mod", "Viewer"];

//clearing the logs and data once when starting
clearSaves("data");
clearSaves("logs");
clearSaves("users");
clearSaves("users_multi");

//the interval size for checking
const second = 15;

//==============> ADD THE CHANNELS TO WATCH HERE || Example: ["channel1", "channel2", "channel3"] <================ 
const channels: string[] = ["inislein", "fuyumitoba",  "lumituber"];

//runs every ${second} seconds
const job = schedule.scheduleJob(`*/${second} * * * * *`, function(){
    channels.forEach((channel) => {
        //fetching who left, joined or stayed
        getViewers(channel);
    })
});

interface axiosData {
    _links: {links: {}};
    chatter_count: number;
    chatters: {broadcaster: string[], vips: string[], moderators: string[], staff: string[], admins: string[], global_mods: string[], viewers: string[]};
}

interface streamerCollection {
    collection: streamer[];
}

interface streamer {
    streamer: string;
    data: streamerData;
}

interface streamerData {
    _links: {};
    chatter_count: number;
    chatters: chatter[][];
}

interface chatterChanges {
    joined: chatter[];
    left: chatter[];
    stayed: chatter[];
}

interface chatter {
    name: string;
    joinedAt: string;
    stayedSince: number;
}

let streamerCollection: streamerCollection = {
    collection: []
}

let currentCollection: streamerData = {
    _links: {
        links: {

        }
    },
    chatter_count: 0,
    chatters: [[],[],[],[],[],[],[]]
}

/**
 * fetches the data of the streamer
 * @param streamer
 * @returns 
 */
function getFromCollection(streamer: string): streamerData {
    let streamerData = streamerCollection.collection.find((c) => c.streamer == streamer)
    if(!streamerData) {
        addToAndUpdateCollection(streamer, {_links: {}, chatter_count: 0, chatters: [[],[],[],[],[],[],[]]})
        return getFromCollection(streamer);
    }else {
        return streamerData.data;
    }
}

/**
 * saves the data of the streamer
 * @param streamer 
 * @param streamerData 
 */
function addToAndUpdateCollection(streamer: string, streamerData: streamerData){
    let sCollection = streamerCollection.collection.find((c) => c.streamer == streamer);
    if(sCollection) sCollection.data = streamerData;
    else streamerCollection.collection.push({streamer: streamer, data: streamerData});
}

/**
 * fetches the data from the website
 * @param streamer 
 * @returns 
 */
function getViewers(streamer: string){
    const link = `http://tmi.twitch.tv/group/user/${streamer}/chatters`
    axios.get(link).then(function (response) {
        const data: axiosData = response.data;
        const chatters = data.chatters;
        const stringChatters: string[][] = [chatters.broadcaster, chatters.vips, chatters.moderators, chatters.staff, chatters.admins, chatters.global_mods, chatters.viewers];
        const userChatters = convertToChatterList(stringChatters)
        currentCollection._links = data._links;
        currentCollection.chatter_count = data.chatter_count;
        currentCollection.chatters = userChatters;
        compareChatterObj(userChatters, streamer);
    });
}

/**
 * this one just converts an array to another type
 * @param stringList 
 * @returns 
 */
function convertToChatterList(stringList: string[][]): chatter[][] {
    let chatterList: chatter[][] = [[],[],[],[],[],[],[]];
    stringList.forEach((sL, i) => {
        sL.forEach((s) => {
            chatterList[i].push({
                name: s,
                joinedAt: createTimeString(new Date()),
                stayedSince: 0
            });
        })
    })
    return chatterList;
}

/**
 * the main method for checking whether someone joined/left/stayed
 * @param inputData 
 * @param streamer 
 * @returns 
 */
function compareChatterObj(inputData: chatter[][], streamer: string){
    let stayed: chatter[][] = [[],[],[],[],[],[],[]];
    let joined: chatter[][] = [[],[],[],[],[],[],[]];
    let left: chatter[][] = [[],[],[],[],[],[],[]];

    let previousChatters:chatter[][] = getFromCollection(streamer).chatters;

    //haha, those were fun... logic, logic logic!

    inputData.forEach((dL, i) => {
        dL.forEach((c) => {
            let savedChatter = previousChatters[i].find((chatter) => chatter.name == c.name);
            if(!savedChatter) {
                joined[i].push(c);
                addChannelToUserOrCreateUser(c, streamer);
            }
            else {
                stayed[i].push({name: savedChatter.name, joinedAt: savedChatter.joinedAt, stayedSince: savedChatter.stayedSince+second});
                updateLurkingTime(c, streamer);
            }
        })
    })

    previousChatters.forEach((sL, i) => {
        sL.forEach((s, j) => {
            if(!inputData[i].map(input => { return input.name; }).includes(s.name)) {
                left[i].push(previousChatters[i][j]);
                updateActivity(s, streamer);
            }
        })
    })

    let newChatters = joined.map((v, i) => {
        return v.concat(stayed[i]).sort((a,b) => { return a.stayedSince - b.stayedSince; });
    })
    
    let saveObject: streamerData = {
        _links: currentCollection._links,
        chatter_count: currentCollection.chatter_count,
        chatters: newChatters
    }

    addToAndUpdateCollection(streamer, saveObject);

    const date = new Date();
    const filename: string = createTimeString(date) + "-" + currentCollection.chatter_count + "-chatters" + ".txt";

    let staying_strings: string[][] = [];

    stayed.forEach((_, i) => {
        if(joined[i].length) {
            //console.log(titles[i] + " joined", e.joined, date );
            addToLogs(filename, titles[i] + " joined " +"\n " + joined[i].map((e) => {return `${e.name} joined at ${e.joinedAt}`}).join("\n ") + "\n", streamer);
        }
        if(left[i].length) {
            //console.log(titles[i] + " left", e.left, date );
            left[i].sort((a,b) => a.stayedSince-b.stayedSince)
            addToLogs(filename, titles[i] + " left " + "\n " + left[i].map((ele) => {
                return `${ele.name} joined at ${ele.joinedAt} and stayed since ${computeTime(ele.stayedSince)}`
            }).join("\n ") + "\n", streamer);
        }
        if(stayed[i].length){
            stayed[i].sort((a,b) => a.stayedSince - b.stayedSince);
            staying_strings = staying_strings.concat(stayed[i].map((ele) => {
                return `${ele.name} stayed since ${computeTime(ele.stayedSince)}`
            }));
        }
    })

    let changes:number[] = joined.map((jL) => jL.length).concat(left.map((sL) => sL.length)).filter((v)=> v!=0);

    if(changes.length) {
        const fn: string = createTimeString(date) + "-" + streamer + "-data" + ".txt";
        saveData(fn, JSON.stringify(saveObject) , streamer);
        if(staying_strings.length) addToLogs(filename, "Stayed:\n " + staying_strings.join("\n "), streamer)
    }

    let currentChatters: string[] = joined.map((jL, i) => jL.concat(stayed[i])).filter(l => l.length != 0).flat().map(c=>c.name);

    currentChatters.forEach((namestring) => {
        let cP = userProfiles.find((v) => v.name == namestring);
        if(!cP) {
            console.error("Why wasn't the user created???? WTF");
            return;
        }
        const userDataFn: string = cP.name + "-data" + ".txt";
        if(cP.channels.length > 1) {
            updateOrSaveUserWatchingMultiple(userDataFn, JSON.stringify(cP), cP.name);
        }
        updateOrSaveUser(userDataFn, JSON.stringify(cP), cP.name);
    })

    
}

/**
 * returns a nicer time string
 * @param time 
 * @returns 
 */
 function computeTime(time: number): string{
    let timeSince:string = "";
    let days = Math.floor(time/60/60/24)%30, hours = Math.floor(time/60/60)%60, minutes = Math.floor(time/60)%60, seconds = time%60;
    if(days>0) timeSince = timeSince.concat(days + " days, ");
    if(hours>0) timeSince = timeSince.concat(hours + " hours, ");
    if(minutes>0) timeSince = timeSince.concat(minutes + " minutes, ")
    timeSince = timeSince.concat(seconds + " seconds");
    return timeSince;
}

/**
 * returns a nicer date string
 * @param date 
 * @returns 
 */
function createTimeString(date: Date): string {
    return date.getDate() + "#" + (date.getMonth()+1)%12 + "#" + date.getHours() + "#" + date.getMinutes() + "#" +  date.getSeconds();
}

/**
 * writes to logs
 * @param filename 
 * @param content 
 * @param streamer 
 */
function addToLogs(filename: string, content: string, streamer: string){
    fs.mkdir(`logs/${streamer}`, {recursive: true}, () => {
        fs.appendFileSync(`logs/${streamer}/${filename}`, content);
    });
}

/**
 * writes to data
 * @param filename 
 * @param content 
 * @param streamer 
 */
function saveData(filename: string, content:string, streamer: string){
    fs.mkdir(`data/${streamer}`, {recursive: true}, () => {
        fs.appendFileSync(`data/${streamer}/${filename}`, content);
    })
}

/**
 * saves a user's data
 * @param filename 
 * @param content 
 * @param username 
 */
function updateOrSaveUser(filename: string, content: string, username: string) {
    fs.rmdirSync(`users/${username}`, {recursive: true});
    fs.mkdirSync(`users/${username}`, {recursive: true});
    try{
        fs.appendFileSync(`users/${username}/${filename}`, content);
    } catch (e) {
        console.log(`The file for ${username} had a problem being created in 'users'. It will be created in the next cycle.`)
    }
}

/**
 * saves user watching multiple streams
 * @param filename 
 * @param content 
 * @param username 
 */
 function updateOrSaveUserWatchingMultiple(filename: string, content: string, username: string) {
    fs.rmdirSync(`users_multi/${username}`, {recursive: true});
    fs.mkdirSync(`users_multi/${username}`, {recursive: true});
    setTimeout(()=>{}, 1)
    try{
        fs.appendFileSync(`users_multi/${username}/${filename}`, content);
    } catch (e) {
        console.log(`The file for ${username} had a problem being created in 'users_multi'. It will be created in the next cycle.`)
    }
}

/**
 * clears the logs/data/users
 * @param type 
 * @returns 
 */
function clearSaves(type: "logs" | "data" | "users" | "users_multi"){
    fs.rmdir(type, {recursive: true}, (err) => {
        if(err) console.error(err);
    })
}

let userProfiles: userProfile[] = [];

interface userProfile {
    name: string;
    lurkingTime: number;
    channels: twitchChannel[];
}

interface twitchChannel {
    name: string;
    timesJoined: number;
    joined: string[];
    currentlyActive: boolean;
}

function addChannelToUserOrCreateUser(chatter: string | chatter, streamer: string) {
    let name: string;
    typeof chatter == "string" ? name = chatter : name = chatter.name;
    let timeString : string = createTimeString(new Date());
    //console.log(streamer)
    userProfiles.forEach((profile) => {
        if(profile.name == name) {
            let channel: twitchChannel | undefined = profile.channels.find(channel => channel.name == streamer);
            if(channel){
                profile.lurkingTime += second/profile.channels.length;
                channel.currentlyActive = true;
                channel.joined.push(timeString);
                channel.timesJoined++;
            } else {
                profile.channels.push({
                    name: streamer, 
                    timesJoined: 1, 
                    joined: [timeString], 
                    currentlyActive: true})
            }
        }
    });
    userProfiles.push({
        name: name,
        lurkingTime: 0,
        channels: [{name: streamer, timesJoined: 1, joined: [timeString], currentlyActive: true}]
    });
}

function updateLurkingTime(chatter: string | chatter, streamer: string) {
    let name: string;
    typeof chatter == "string" ? name = chatter : name = chatter.name;
    userProfiles.forEach((profile) => {
        if(profile.name == name) {
            profile.lurkingTime+=second/profile.channels.length;
        }
    })
}

function updateActivity(chatter: string | chatter, streamer: string){
    let name: string;
    typeof chatter == "string" ? name = chatter : name = chatter.name;
    userProfiles.forEach((profile) => {
        if(profile.name == name) {
            let channel: twitchChannel | undefined = profile.channels.find(channel => channel.name == streamer);
            if(channel){
                channel.currentlyActive = false;
            }
        }
    });
}