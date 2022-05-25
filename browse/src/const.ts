const TRAP_NZ_IDS = new Map();
const TRAP_NZ_SPECIES = [
  "rodent",
  "none",
  "lizard",
  "unspecified",
  "rat",
  "mouse",
  "ferret",
  "stoat",
  "weasel",
  "rabbit",
  "hedgehog",
  "possum",
  "insect",
  "weta",
  "bird",
  "magpie",
  "cat",
  "dog",
  "other",
];

export class TrackLabel {
  value: string;
  text: string;
  trapNzSpecies?: string;
  includes: TrackLabel[];
  allIncludedTags: string[];

  constructor(
    parent: TrackLabel,
    dbLabel: string,
    description: string = null,
    trapNzName = null
  ) {
    this.value = dbLabel;
    this.text = description ? description : this.value;
    this.includes = [];
    this.allIncludedTags = [this.value];

    if (parent) {
      parent.addChild(this);
    }

    this.trapNzSpecies = this.makeTrapIdSpecies(parent, trapNzName);
  }

  addChild(child: TrackLabel) {
    this.includes.push(child);
    this.allIncludedTags.push(child.value);
  }

  makeTrapIdSpecies(parent: TrackLabel, trapNzName = null): string {
    let trapNZ = trapNzName ? trapNzName : this.value;
    if (!TRAP_NZ_SPECIES.includes(trapNZ)) {
      trapNZ = parent ? parent.trapNzSpecies : null;
    }

    if (trapNZ) {
      TRAP_NZ_IDS.set(this.value, trapNZ);
    }

    return trapNZ;
  }
}

const nomenclatureBase = new TrackLabel(null, "base");

const things = new TrackLabel(nomenclatureBase, "things", "things", "other");
const notKnown = new TrackLabel(
  nomenclatureBase,
  "not known",
  "not known",
  "unspecified"
);
const nothing = new TrackLabel(nomenclatureBase, "nothing", "nothing", "none");
const descriptors = new TrackLabel(nomenclatureBase, "descriptors");

const allBirds = new TrackLabel(things, "allbirds", "any type of bird", "bird");
const bird = new TrackLabel(allBirds, "bird");
const kiwi = new TrackLabel(allBirds, "bird/kiwi", "kiwi");

const pest = new TrackLabel(things, "pest", "One of our target pest species");
const possum = new TrackLabel(pest, "possum");
const rodent = new TrackLabel(pest, "rodent", "rat or mouse", "rat");
new TrackLabel(pest, "mustelid", "stoat, weasel or ferret (mustelid)", "stoat");
const hedgehog = new TrackLabel(pest, "hedgehog");
const cat = new TrackLabel(pest, "cat");

new TrackLabel(things, "dog");
new TrackLabel(things, "leporidae", "hare or rabbit (leporidae)", "rabbit");
const wallaby = new TrackLabel(things, "wallaby");
new TrackLabel(things, "pig");
new TrackLabel(things, "sheep");
new TrackLabel(things, "human");
new TrackLabel(things, "insect", "spider or insect (on camera lens or flying)");
new TrackLabel(things, "penguin");
new TrackLabel(things, "sealion");
new TrackLabel(things, "deer");
new TrackLabel(things, "goat");
new TrackLabel(things, "vehicle");
const other = new TrackLabel(things, "other");

const part = new TrackLabel(descriptors, "part", "part of animal (eg tail)");
const poorTracking = new TrackLabel(descriptors, "poor tracking");

const interesting = new TrackLabel(descriptors, "interesting");

const falsePositive = new TrackLabel(
  nothing,
  "false-positive",
  "false positive"
);

new TrackLabel(nothing, "none");
new TrackLabel(notKnown, "unidentified");
const unknown = new TrackLabel(notKnown, "unknown", "not identifiable");

// specified means - can have another specified tag in the search (eg Possum)
const recordingLabelsBase = [
  {
    value: "missed track",
    text: "Missed animal track",
    specified: true,
  },
  {
    value: "missed recording",
    text: "Missed recording (before this one)",
    specified: false,
  },
  {
    value: "multiple animals",
    text: "Multiple animals in video",
    specified: true,
  },
  {
    value: "trapped in trap",
    text: "Animal in trap",
    specified: true,
  },
  {
    value: "interaction with trap",
    text: "Animal interacted with trap",
    specified: true,
  },
  {
    value: "cool",
    text: "Cool video",
    specified: true,
  },
  {
    value: "requires review",
    text: "Flagged for review",
    specified: true,
  },
];

const taggingFilters = [
  {
    value: "any",
    text: "All",
    specified: false,
  },
  {
    value: "no-human",
    text: "Not tagged by human",
    specified: false,
  },
  {
    value: "tagged",
    text: "Tagged as...",
    specified: true,
  },
  {
    value: "human-tagged",
    text: "Human tagged as...",
    specified: true,
  },
  {
    value: "automatic-tagged",
    text: "AI tagged as...",
    specified: true,
  },
  {
    value: "both-tagged",
    text: "AI and human tagged as...",
    specified: true,
  },
  {
    value: "untagged",
    text: "Untagged only",
    specified: false,
  },
];

export const BirdLabels = [
  "adelie penguin",
  "albatross",
  "american golden plover",
  "antarctic fulmar",
  "antarctic petrel",
  "antarctic prion",
  "antarctic tern",
  "antipodean albatross",
  "antipodes island parakeet",
  "arctic skua",
  "arctic tern",
  "asiatic dowitcher",
  "atlantic yellow-nosed mollymawk",
  "auckland island rail",
  "auckland island shag",
  "auckland island teal",
  "australasian bittern",
  "australasian crested grebe",
  "australasian gannet",
  "australasian little grebe",
  "australasian shoveler",
  "australian coot",
  "australian crake",
  "australian magpie",
  "australian pelican",
  "australian reed warbler",
  "australian white-eyed duck",
  "australian wood duck",
  "avocet",
  "baird's sandpiper",
  "banded dotterel",
  "banded rail",
  "bar-tailed godwit",
  "barbary dove",
  "barn owl",
  "bellbird",
  "bittern",
  "black kite",
  "black noddy",
  "black petrel",
  "black robin",
  "black shag",
  "black stilt",
  "black swan",
  "black-bellied storm petrel",
  "black-billed gull",
  "black-browed mollymawk",
  "black-faced cuckoo-shrike",
  "black-faced monarch",
  "black-footed albatross",
  "black-fronted dotterel",
  "black-fronted tern",
  "black-tailed godwit",
  "black-tailed native-hen",
  "black-winged petrel",
  "blackbird",
  "blue duck",
  "blue petrel",
  "booby",
  "bounty island shag",
  "bridled tern",
  "bristle-thighed curlew",
  "broad-billed prion",
  "broad-billed sandpiper",
  "brown booby",
  "brown creeper",
  "brown noddy",
  "brown quail",
  "brown teal",
  "buff-breasted sandpiper",
  "bulbul",
  "buller's mollymawk",
  "buller's shearwater",
  "bulwer's petrel",
  "bunting",
  "california quail",
  "campbell black-browed mollymawk",
  "campbell island shag",
  "campbell island teal",
  "canada goose",
  "cape barren goose",
  "cape gannet",
  "cape petrel",
  "caspian tern",
  "cattle egret",
  "chaffinch",
  "channel-billed cuckoo",
  "chatham island mollymawk",
  "chatham island oystercatcher",
  "chatham island pigeon",
  "chatham island shag",
  "chatham island snipe",
  "chatham island taiko",
  "chatham island warbler",
  "chatham petrel",
  "chestnut teal",
  "chestnut-breasted shelduck",
  "chinstrap penguin",
  "christmas island shearwater",
  "chukor",
  "cirl bunting",
  "cockatoo",
  "collared petrel",
  "common diving petrel",
  "common greenshank",
  "common moorhen",
  "common myna",
  "common pheasant",
  "common redpoll",
  "common sandpiper",
  "common starling",
  "common tern",
  "cook's petrel",
  "corncrake",
  "cory's shearwater",
  "crake",
  "crane",
  "creeper",
  "crested tern",
  "crimson rosella",
  "cuckoo",
  "curlew sandpiper",
  "curlew",
  "dabchick",
  "darter",
  "dollarbird",
  "dotterel",
  "dove",
  "dowitcher",
  "duck",
  "dunlin",
  "dunnock",
  "dusky moorhen",
  "dusky woodswallow",
  "eagle",
  "eastern curlew",
  "eastern rockhopper penguin",
  "eastern rosella",
  "egret",
  "emperor penguin",
  "erect-crested penguin",
  "eurasian blackbird",
  "eurasian skylark",
  "european goldfinch",
  "european greenfinch",
  "fairy martin",
  "fairy prion",
  "fairy tern",
  "falcon",
  "fan-tailed cuckoo",
  "fantail",
  "fernbird",
  "fiordland crested penguin",
  "flesh-footed shearwater",
  "fluttering shearwater",
  "flycatcher",
  "forbes' parakeet",
  "fork-tailed swift",
  "franklin's gull",
  "frigatebird",
  "fulmar prion",
  "fulmar",
  "galah",
  "gannet",
  "gentoo penguin",
  "glossy ibis",
  "godwit",
  "golden whistler",
  "goldfinch",
  "goose",
  "gould's petrel",
  "great frigatebird",
  "great knot",
  "great shearwater",
  "great spotted kiwi",
  "greater sand plover",
  "grebe",
  "greenfinch",
  "greenshank",
  "grey duck",
  "grey heron",
  "grey noddy",
  "grey petrel",
  "grey phalarope",
  "grey plover",
  "grey teal",
  "grey warbler",
  "grey-backed storm petrel",
  "grey-backed tern",
  "grey-faced petrel",
  "grey-headed mollymawk",
  "grey-tailed tattler",
  "greylag goose",
  "guineafowl",
  "gull",
  "gull-billed tern",
  "harrier",
  "helmeted guineafowl",
  "herald petrel",
  "heron",
  "hoary-headed grebe",
  "house sparrow",
  "hudsonian godwit",
  "hutton's shearwater",
  "ibis",
  "indian ocean yellow-nosed mollymawk",
  "japanese snipe",
  "juan fernandez petrel",
  "kaka",
  "kakapo",
  "kakpo",
  "kea",
  "kerguelen petrel",
  "kermadec petrel",
  "kermadec storm petrel",
  "kestrel",
  "king penguin",
  "kingfisher",
  "kite",
  "kiwi",
  "knot",
  "kokako",
  "kookaburra",
  "laughing gull",
  "laughing kookaburra",
  "laysan albatross",
  "leach's storm petrel",
  "least sandpiper",
  "lesser frigatebird",
  "lesser knot",
  "lesser sand plover",
  "lesser yellowlegs",
  "light-mantled sooty albatross",
  "little bittern",
  "little black shag",
  "little egret",
  "little owl",
  "little penguin",
  "little shag",
  "little shearwater",
  "little spotted kiwi",
  "little stint",
  "little tern",
  "little whimbrel",
  "long-tailed cuckoo",
  "long-tailed skua",
  "long-toed stint",
  "macaroni penguin",
  "macquarie island shag",
  "magpie",
  "magpie-lark",
  "mallard",
  "mammal",
  "manx shearwater",
  "marsh crake",
  "marsh sandpiper",
  "martin",
  "masked booby",
  "masked woodswallow",
  "mollymawk",
  "monarch",
  "moorhen",
  "morepork",
  "moseley's rockhopper penguin",
  "mottled petrel",
  "muscovy duck",
  "mute swan",
  "myna",
  "nankeen kestrel",
  "nankeen night heron",
  "needletail",
  "new zealand dabchick",
  "new zealand dotterel",
  "new zealand falcon",
  "new zealand fantail",
  "new zealand king shag",
  "new zealand pigeon",
  "new zealand pipit",
  "new zealand scaup",
  "new zealand storm petrel",
  "newell's shearwater",
  "noddy",
  "norfolk morepork",
  "norfolk parrot",
  "north island brown kiwi",
  "north island kokako",
  "north island robin",
  "north island saddleback",
  "northern fulmar",
  "northern giant petrel",
  "northern pintail",
  "northern royal albatross",
  "northern shoveler",
  "okarito brown kiwi",
  "orange-fronted parakeet",
  "oriental cuckoo",
  "oriental dotterel",
  "oriental pratincole",
  "owl",
  "oystercatcher",
  "pacific golden plover",
  "pacific gull",
  "pacific heron",
  "painted snipe",
  "pallid cuckoo",
  "paradise shelduck",
  "parakeet",
  "parrot",
  "partridge",
  "peafowl",
  "pectoral sandpiper",
  "pelican",
  "penguin",
  "petrel",
  "phalarope",
  "pheasant",
  "phoenix petrel",
  "pied shag",
  "pied stilt",
  "pigeon",
  "pink-eared duck",
  "pink-footed shearwater",
  "pintail",
  "pipit",
  "pitt island shag",
  "plover",
  "plumed egret",
  "plumed whistling duck",
  "pomarine skua",
  "pratincole",
  "prion",
  "providence petrel",
  "pukeko",
  "purple swamphens",
  "pycroft's petrel",
  "quail",
  "rail",
  "rainbow lorikeet",
  "red wattlebird",
  "red-billed gull",
  "red-capped plover",
  "red-crowned parakeet",
  "red-footed booby",
  "red-kneed dotterel",
  "red-legged partridge",
  "red-necked avocet",
  "red-necked phalarope",
  "red-necked stint",
  "red-tailed tropicbird",
  "red-vented bulbul",
  "redpoll",
  "reef heron",
  "reischek's parakeet",
  "rifleman",
  "robin",
  "rock pigeon",
  "rock wren",
  "rook",
  "rooster",
  "rose-crowned fruit-dove",
  "rose-ringed parakeet",
  "rosella",
  "royal penguin",
  "royal spoonbill",
  "ruddy turnstone",
  "ruff",
  "sacred kingfisher",
  "saddleback",
  "salvin's mollymawk",
  "salvin's prion",
  "sanderling",
  "sandpiper",
  "satin flycatcher",
  "scaup",
  "semipalmated plover",
  "semipalmated sandpiper",
  "shag",
  "sharp-tailed sandpiper",
  "shearwater",
  "shining cuckoo",
  "shore plover",
  "short-tailed shearwater",
  "silvereye",
  "skua",
  "skylark",
  "snares crested penguin",
  "snares island snipe",
  "snipe",
  "snow petrel",
  "soft-plumaged petrel",
  "song thrush",
  "sooty albatross",
  "sooty shearwater",
  "sooty tern",
  "south georgian diving petrel",
  "south island kokako",
  "south island pied oystercatcher",
  "south island robin",
  "south island saddleback",
  "south island takahe",
  "south polar skua",
  "southern black-backed gull",
  "southern brown kiwi",
  "southern giant petrel",
  "southern royal albatross",
  "sparrow",
  "spoonbill",
  "spotless crake",
  "spotted dove",
  "spotted shag",
  "spur-winged plover",
  "starling",
  "stejneger's petrel",
  "stewart island shag",
  "stilt sandpiper",
  "stilt",
  "stint",
  "stitchbird",
  "straw-necked ibis",
  "streaked shearwater",
  "subantarctic little shearwater",
  "subantarctic skua",
  "subantarctic snipe",
  "sulphur-crested cockatoo",
  "swallow",
  "swamp harrier",
  "swift",
  "tahiti petrel",
  "takahe",
  "tattler",
  "teal",
  "terek sandpiper",
  "tern",
  "thin-billed prion",
  "thrush",
  "tomtit",
  "tree martin",
  "triller",
  "tropicbird",
  "tui",
  "turkey",
  "turnstone",
  "unidentified crane",
  "upland sandpiper",
  "variable oystercatcher",
  "wagtail",
  "wandering albatross",
  "wandering tattler",
  "warbler",
  "wattlebird",
  "wedge-tailed shearwater",
  "weka",
  "welcome swallow",
  "western rockhopper penguin",
  "western sandpiper",
  "westland petrel",
  "whimbrel",
  "whiskered tern",
  "white heron",
  "white ibis",
  "white tern",
  "white-bellied sea eagle",
  "white-bellied storm petrel",
  "white-browed woodswallow",
  "white-capped mollymawk",
  "white-chinned petrel",
  "white-faced heron",
  "white-faced storm petrel",
  "white-fronted tern",
  "white-headed petrel",
  "white-naped petrel",
  "white-rumped sandpiper",
  "white-tailed tropicbird",
  "white-throated needletail",
  "white-winged black tern",
  "white-winged triller",
  "whitehead",
  "wild turkey",
  "willie wagtail",
  "wilson's phalarope",
  "wilson's storm petrel",
  "woodswallow",
  "wrybill",
  "yellow-billed spoonbill",
  "yellow-crowned parakeet",
  "yellow-eyed penguin",
  "yellowhammer",
  "yellowhead",
  // OTHER SOUNDS
  "dog",
  "deer",
  "mustelid",
  "wind",
  "rain",
  "insect",
  "static",
  "vehicle",
  "other",
];

//filter out duplicates
const BirdTags = BirdLabels.map(
  (label) => new TrackLabel(nomenclatureBase, label)
);

const searchRecordingBase = [...taggingFilters, ...recordingLabelsBase];

const filtersWhichCanHaveSpecifiedTags = searchRecordingBase
  .filter((tag) => tag.specified == true)
  .map((tag) => tag.value);

const DefaultLabels = {
  trackLabelsBase: [
    ...pest.includes,
    ...allBirds.includes,
    pest,
    ...things.includes,
    unknown,
    part,
    poorTracking,
    other,
  ],
  tagTypes: [...taggingFilters],
  otherTagLabels: function () {
    return [unknown, falsePositive];
  },
  quickTagLabels: function () {
    return [possum.value, rodent.value, hedgehog.value, cat.value, bird.value];
  },
  wallabyQuickTagLabels: function () {
    return [wallaby.value, possum.value, rodent.value, cat.value, bird.value];
  },
  recordingLabels: function () {
    return [...recordingLabelsBase];
  },
  searchRecordingLabels: function () {
    return [...searchRecordingBase];
  },
  searchLabels: function () {
    return [
      interesting,
      ...this.trackLabelsBase,
      ...BirdTags.filter((tag) => tag.value !== "kiwi"),
    ];
  },
  trackLabels: function () {
    return [...this.trackLabelsBase];
  },
  canHaveSpecifiedTags: function (tagType) {
    return (
      filtersWhichCanHaveSpecifiedTags.find((tag) => tag === tagType) != null
    );
  },
  overViewAiEvaluationMatrix: function () {
    return [bird, pest];
  },
  detailedAiEvaluationMatrix: function () {
    return [bird, ...pest.includes, wallaby, nothing, notKnown];
  },
  filteredLabels: function () {
    return [falsePositive];
  },
  descriptorTags: function () {
    return descriptors.includes;
  },
  allDescriptorTags: function () {
    return descriptors.allIncludedTags;
  },
  falsePositiveLabel: falsePositive,
  birdLabel: bird,
  unknownLabel: unknown,
  unidentifiedLabel: undefined,
};

export const TagColours = [
  "#575fcf",
  "#4bcffa",
  "#f7b731",
  "#ffdd59",
  "#0be881",
  "#00d8d6",
  "#a55eea",
  "#0fb9b1",
];

function imgSrc(what) {
  let image = null;
  if (what == kiwi.value) {
    image = "kiwi.png";
  } else {
    image = what + ".png";
  }
  return "/" + image;
}

function getTrapNzSpecies(label: string) {
  const lowerLabel = label.toLowerCase();
  return TRAP_NZ_IDS.get(lowerLabel) || "";
}

export { getTrapNzSpecies, imgSrc };
export default DefaultLabels;

export const WALLABY_GROUP = 160;

export const FILTERED_TOOLTIP = `Show videos and tracks tagged as ${DefaultLabels.filteredLabels()
  .map((label) => label.value)
  .join("")}`;
