import axios from "axios";
import * as cheerio from "cheerio";
import { readFileSync, writeFileSync } from "node:fs";

const getCelebrationSource1Song = async (songNumber) => {
  const baseUrl = "https://hymnary.org/hymn/CEL1997";

  const resp = await axios.get(`${baseUrl}/${songNumber}#text`);
  const $ = cheerio.load(resp.data);

  if ($("#text").length < 1) {
    return null;
  }

  const paragraphs = getParagraphs($, $("#text p"));
  const title = $(".hymntitle").text();

  return {
    songNumber,
    title,
    lyrics: paragraphs,
  };
};

const getCelebrationSource2 = async () => {
  const resp = await axios.get(
    "https://digitalsongsandhymns.com/c/songbook/celebration-hymnal"
  );

  const $ = cheerio.load(resp.data);
  const $td = $("td");

  let index = [];

  for (let i = 0; i < $td.length; i += 2) {
    index.push({
      number: $($td[i]).text(),
      numberParsed: parseInt($($td[i]).text()),
      title: $($td[i]).next().text(),
      link: $($td[i]).next().find("a").attr("href"),
    });
  }

  index = index
    .filter((s) => !isNaN(s.numberParsed))
    .sort((s1, s2) => s1.numberParsed - s2.numberParsed);

  return index;
};

const getCelebrationSource2Song = async (song) => {
  const resp = await axios.get(song.link);
  const $ = cheerio.load(resp.data);

  const ps = $("#tab-lyrics p");
  return getParagraphs($, ps);
};

const getParagraphs = ($, ps) => {
  const paragraphs = [];

  for (const p of ps) {
    paragraphs.push($(p).find("br").replaceWith("\n").end().text().trim());
  }

  return paragraphs;
};

const getCelebrationSongBook = async () => {
  const source2Songs = await getCelebrationSource2();

  let songs;

  try {
    songs = JSON.parse(readFileSync("celebration.json").toString());
  } catch (e) {
    songs = [];
  }

  const startFrom = songs[songs.length - 1]?.songNumber || 0;

  for (let songNumber = startFrom + 1; songNumber <= 818; songNumber++) {
    try {
      let song = await getCelebrationSource1Song(songNumber);

      if (!song) {
        console.warn(
          `Could not get song ${songNumber} from source 1. Trying source 2`
        );
        const source2Song = source2Songs.find(
          (s) => s.numberParsed === songNumber
        );
        if (!source2Song) {
          throw new Error("Could not get Song from either sources");
        }
        const paragraphs = await getCelebrationSource2Song(source2Song);
        song = {
          songNumber,
          lyrics: paragraphs,
          title: `${songNumber}. ${source2Song.title}`,
        };
      }

      songs.push(song);

      writeFileSync("celebration.json", JSON.stringify(songs, null, 2));

      console.log(`Got song ${songNumber}`);
    } catch (e) {
      console.error(`Failed to get Song ${songNumber}`);
      console.error(e);
    }
  }
};

const buildSongbookTextFile = () => {
  const songs = JSON.parse(readFileSync("celebration.json").toString());

  const songbookText = songs
    .map((song) => {
      const lyrics = song.lyrics
        .reduce((lyrics, para, index, paras) => {
          if (/^Verse \d+$/.test(para)) {
            const verse = para.match(/Verse (\d+)/)[1];
            paras[index + 1] = `V${verse}. ${paras[index + 1]}`;
            return lyrics;
          }

          if ("Chorus" === para) {
            paras[index + 1] = `C. ${paras[index + 1]}`;
            return lyrics;
          }

          para = para
            .replace(/\n{2,}/g, "\n")
            .replace(/^(\d)+\.?/, "V$1.")
            .replace(/^Verse (\d)\s*\n/, "V$1. ")
            .replace(/^Verse\s*\n/, "")
            .replace(/^Chorus:?\s*\n/, "C. ")
            .replace(/^Refrain:(\n\n)?/, "C. ")
            .trim();

          return [...lyrics, para];
        }, [])
        .join("\n\n");
      /*
      Song #. Song Title
      Copyright or Written by Author (optional)
      Empty line
      V#. Lyrics (where # is the verse number. Use “C.” for Chorus, instead of “V.”)
      Lyrics
      Lyrics
      etc..
      Empty line
      Next verse #. Lyrics
      Lyrics
      Lyrics
      etc..
      Empty line
      etc. (other lyrics)
      Empty line
      Copyright symbol: © (Alt+0169) (+ optional copyright text on the same line)
      At least two empty lines
      Next song
    */
      return `Song ${song.title}\n\n` + lyrics + "\n\n©";
    })
    .join("\n\n\n");

  writeFileSync("celebration.txt", songbookText);
};

// const source2Songs = await getSource2();
// console.log(await getSource1Song("1"));
// getSource2Song(songs[0]);

await getCelebrationSongBook();
await buildSongbookTextFile();
