import { jtree } from "jtree"
import { pldbNodeKeywords } from "./types"
import {
  nodeToFlatObject,
  getJoined,
  getPrimaryKey,
  isLanguage,
  getCleanedId
} from "./utils"

const lodash = require("lodash")
const { TreeNode } = jtree
const {
  TreeBaseFolder,
  TreeBaseFile
} = require("jtree/products/treeBase.node.js")
const { Disk } = require("jtree/products/Disk.node.js")

const typeNames = new TreeNode(`application
assembly assembly language
binaryDataFormat
binaryExecutable binary executable format
bytecode bytecode format
characterEncoding
cloud cloud service
compiler
editor
esolang esoteric programming language
filesystem
framework
grammarLanguage
idl interface design language
interpreter
ir intermediate representation language
isa instruction set architecture
jsonFormat
library
linter
metalanguage
notation
os operating system
packageManager
pattern design pattern
pl programming language
plzoo minilanguage
protocol
queryLanguage
schema
standard
stylesheetLanguage
template template language
textData text data format
textMarkup text markup language
visual visual programming language
vm virtual machine
webApi
xmlFormat`).toObject()

class PLDBFile extends TreeBaseFile {
  get primaryKey() {
    return getPrimaryKey(this)
  }

  get link() {
    return `<a href="${this.primaryKey}.html">${this.primaryKey}</a>`
  }

  get patternPath() {
    return `patterns ${this.get("patternKeyword")}`
  }

  get previousRanked() {
    return this.base.getFileAtRank(this.rank - 1)
  }

  get nextRanked() {
    return this.base.getFileAtRank(this.rank + 1)
  }

  get _getLanguagesWithThisPatternResearched() {
    const patternKeyword = this.get("patternKeyword")

    return this.base.filter(file =>
      file.getNode("patterns")?.has(patternKeyword)
    )
  }

  get languagesWithThisPattern() {
    const { patternPath } = this
    return this._getLanguagesWithThisPatternResearched.filter(
      file => file.get(patternPath) === "true"
    )
  }

  get languagesWithoutThisPattern() {
    const { patternPath } = this
    return this._getLanguagesWithThisPatternResearched.filter(
      file => file.get(patternPath) === "false"
    )
  }

  getMostRecentInt(pathToSet: string): number {
    let set = this.getNode(pathToSet)
    if (!set) return 0
    set = set.toObject()
    const key = Math.max(...Object.keys(set).map(year => parseInt(year)))
    return parseInt(set[key])
  }

  private _title: string

  get title() {
    if (!this._title) this._title = this.get("title") || this.primaryKey
    return this._title
  }

  get isLanguage() {
    return isLanguage(this.get("type"))
  }

  get wikipediaTitle() {
    const wp = this.get("wikipedia")
    return wp ? wp.replace("https://en.wikipedia.org/wiki/", "").trim() : ""
  }

  get numberOfUsers() {
    return this.base.predictNumberOfUsers(this)
  }

  get numberOfJobs() {
    return this.base.predictNumberOfJobs(this)
  }

  get percentile() {
    return this.base.predictPercentile(this)
  }

  get languageRank() {
    return this.base.getLanguageRank(this)
  }

  get rank() {
    return this.base.getRank(this)
  }

  get extensions() {
    return getJoined(this, [
      "fileExtensions",
      "githubLanguage fileExtensions",
      "wikipedia fileExtensions"
    ])
  }

  get typeName() {
    let type = this.get("type")
    type = typeNames[type] || type
    return lodash.startCase(type).toLowerCase()
  }

  get base() {
    return this.getParent() as PLDBBaseFolder
  }

  get linksToOtherFiles() {
    const programParser = this.base.grammarProgramConstructor
    const program = new programParser(this.childrenToString())
    return program
      .findAllWordsWithCellType("permalinkCell")
      .map(word => word.word)
  }

  getAll(keyword) {
    return this.findNodes(keyword).map(i => i.getContent())
  }

  // todo: move upstream to Grammar
  formatAndSave() {
    const original = this.childrenToString()
    const noBlankLines = original.replace(/\n\n+/g, "\n")
    const programParser = this.base.grammarProgramConstructor
    const program = new programParser(noBlankLines)

    program.sort((nodeA, nodeB) => {
      const a = nodeA.sortIndex ?? 0
      const b = nodeB.sortIndex ?? 0
      return a > b ? -1 : a < b ? 1 : nodeA.getLine() > nodeB.getLine()
    })

    // pad sections
    program
      .filter(node => node.padOnFormat)
      .forEach(node => {
        if (node.getPrevious().getLine() !== "") node.prependSibling("")
        if (node.getNext().getLine() !== "") node.appendSibling("")
      })

    this.setChildren(program.toString())
    this.save()
  }
}

class PLDBBaseFolder extends TreeBaseFolder {
  static getBase() {
    return new (<any>PLDBBaseFolder)(
      undefined,
      __dirname + "/things/"
    ) as PLDBBaseFolder
  }

  get dir() {
    return this._getDir()
  }

  createParser() {
    return new TreeNode.Parser(PLDBFile)
  }

  get patternFiles() {
    return this.filter(file => file.get("type") === "pattern")
  }

  get grammarProgramConstructor() {
    if (!this._grammarProgramConstructor)
      this._grammarProgramConstructor = new jtree.HandGrammarProgram(
        Disk.read(this._getDir() + "pldb.grammar")
      ).compileAndReturnRootConstructor()

    return this._grammarProgramConstructor
  }

  _inboundLinks: any
  get inboundLinks() {
    if (this._inboundLinks) return this._inboundLinks

    const inBoundLinks = {}
    this.forEach(file => {
      inBoundLinks[file.primaryKey] = []
    })

    this.forEach(file => {
      file.linksToOtherFiles.forEach(link => {
        if (!inBoundLinks[link])
          console.error(
            `Broken permalink in '${file.primaryKey}': No language "${link}" found`
          )
        else inBoundLinks[link].push(file.primaryKey)
      })
    })

    this._inboundLinks = inBoundLinks
    return this._inboundLinks
  }

  get typesFile() {
    // Build the types file
    // interface pldbNode
    const gpc = this._grammarProgramConstructor
    const tsContent =
      "// Autogenerated from Grammar\n\n" +
      new gpc()
        .getDefinition()
        .toTypeScriptInterface()
        .replace("interface pldbNode", "export interface pldbNode")
    return tsContent
  }

  _searchIndex?: Map<string, string>
  get searchIndex() {
    if (this._searchIndex) return this._searchIndex
    const map = new Map()
    this.forEach(file => {
      const id = file.primaryKey
      map.set(file.primaryKey, id)
      map.set(file.title, id)
      const wp = file.wikipediaTitle
      if (wp) map.set(wp, id)
      const aka = file.getAll("aka")
      if (aka.length) aka.forEach(name => map.set(name, id))
    })
    this._searchIndex = map
    return this._searchIndex
  }

  searchForEntity(query) {
    const { searchIndex } = this
    return searchIndex.get(query) || searchIndex.get(getCleanedId(query))
  }

  getFile(id) {
    return this.getNode(this.dir + id + ".pldb")
  }

  predictNumberOfUsers(file) {
    const mostRecents = [
      "linkedInSkill",
      "subreddit memberCount",
      "projectEuler members"
    ]
    const directs = ["meetup members", "githubRepo stars"]
    const customs = {
      wikipedia: v => 20,
      "patterns hasCentralPackageRepository?": v => 1000,
      "wikipedia dailyPageViews": count => 100 * (parseInt(count) / 20), // say its 95% bot traffic, and 1% of users visit the wp page daily
      linguistGrammarRepo: c => 200, // According to https://github.com/github/linguist/blob/master/CONTRIBUTING.md, linguist indicates a min of 200 users.
      codeMirror: v => 50,
      website: v => 1,
      githubRepo: v => 1,
      "githubRepo forks": v => v * 3
    }

    return Math.round(
      lodash.sum(mostRecents.map(key => file.getMostRecentInt(key))) +
        lodash.sum(directs.map(key => parseInt(file.get(key) || 0))) +
        lodash.sum(
          Object.keys(customs).map(key => {
            const val = file.get(key)
            return val ? customs[key](val) : 0
          })
        )
    )
  }

  predictNumberOfJobs(file) {
    return (
      Math.round(file.getMostRecentInt("linkedInSkill") * 0.01) +
      file.getMostRecentInt("indeedJobs")
    )
  }

  // Rank is:
  // numberOfUsersRank + numberOfJobsRank + factCountRank + numInboundLinks
  // todo: add a pagerank like element
  _calcRanks(files = this.getChildren()) {
    const { inboundLinks } = this
    let objects = files.map(file => {
      const id = file.primaryKey
      const object: any = {}
      object.id = id
      object.jobs = this.predictNumberOfJobs(file)
      object.users = this.predictNumberOfUsers(file)
      object.factCount = file.length
      object.inBoundLinkCount = inboundLinks[id].length
      return object
    })
    objects = lodash.sortBy(objects, ["jobs"])
    objects.reverse()
    objects.forEach((obj, rank) => (obj.jobRank = rank))

    objects = lodash.sortBy(objects, ["users"])
    objects.reverse()
    objects.forEach((obj, rank) => (obj.userRank = rank))

    objects = lodash.sortBy(objects, ["factCount"])
    objects.reverse()
    objects.forEach((obj, rank) => (obj.factCountRank = rank))

    objects = lodash.sortBy(objects, ["inBoundLinkCount"])
    objects.reverse()
    objects.forEach((obj, rank) => (obj.inBoundLinkRank = rank))

    objects.forEach(
      (obj, rank) =>
        (obj.totalRank =
          obj.jobRank + obj.userRank + obj.factCountRank + obj.inBoundLinkRank)
    )
    objects = lodash.sortBy(objects, ["totalRank"])

    const ranks = {}
    objects.forEach((obj, index) => (ranks[obj.id] = index))
    return ranks
  }

  _ranks: any
  _languageRanks: any
  _inverseRanks: any
  _getRanks(files = this.getChildren()) {
    if (!this._ranks) {
      this._ranks = this._calcRanks(files)
      this._languageRanks = this._calcRanks(
        files.filter(file => file.isLanguage)
      )
      this._inverseRanks = {}
      Object.keys(this._ranks).forEach(id => {
        this._inverseRanks[this._ranks[id]] = id
      })
    }
    return this._ranks
  }

  getFileAtRank(rank) {
    if (rank < 0) rank = this.length - 1
    if (rank >= this.length) rank = 0
    return this.getFile(this._inverseRanks[rank])
  }

  predictPercentile(file) {
    const files = this.getChildren()
    const ranks = this._getRanks(files)
    return ranks[file.primaryKey] / files.length
  }

  getLanguageRank(file) {
    this._getRanks()
    return this._languageRanks[file.primaryKey]
  }

  getRank(file) {
    const ranks = this._getRanks()
    return ranks[file.primaryKey]
  }

  toObjectsForCsv() {
    // todo: sort columns by importance
    const program = this.toProgram()
    program.getTopDownArray().forEach(node => {
      if (node.includeChildrenInCsv === false) node.deleteChildren()
      if (node.getNodeTypeId() === "blankLineNode") node.destroy()
    })
    program.forEach(node => {
      node.set("id", getPrimaryKey(node))
    })
    const objects = program.map(nodeToFlatObject)
    const ranks = this._getRanks()
    // Add ranks
    objects.forEach(obj => {
      obj.rank = ranks[obj.id]
    })

    return lodash.sortBy(objects, "rank")
  }
}

export { PLDBBaseFolder, PLDBFile }
