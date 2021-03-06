$(document).ready(function() {
	$("#loading").show();
	$("#app").hide();

	/*  Load these all from the server. See individual files for expected format */
	var parties = [];
	var advertisers = [];
	var adverts = [];
	$.getJSON("datasets/parties.json", (partiesJSON) => { parties = partiesJSON; start(); });
	$.getJSON("datasets/mock-advertisers.json", (advertisersJSON) => { advertisers = advertisersJSON; start(); });
	$.getJSON("datasets/mock-adverts.json", (advertsJSON) => { adverts = advertsJSON; start(); });

	function start() {
		console.log(parties.length, advertisers.length, adverts.length);

		if(parties.length == 0 || advertisers.length == 0 || adverts.length == 0) return false;

		$("#loading").hide();
		$("#app").show();
		console.log("All loaded");

		Vue.component('party-span', {
			template: "#party-span",
			props: ['party'],
			methods: {
				invertColor: function(hex, bw) {
				    if (hex.indexOf('#') === 0) {
				        hex = hex.slice(1);
				    }
				    // convert 3-digit hex to 6-digits.
				    if (hex.length === 3) {
				        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
				    }
				    if (hex.length !== 6) {
				        throw new Error('Invalid HEX color.');
				    }
				    var r = parseInt(hex.slice(0, 2), 16),
				        g = parseInt(hex.slice(2, 4), 16),
				        b = parseInt(hex.slice(4, 6), 16);
				    if (bw) {
				        // http://stackoverflow.com/a/3943023/112731
				        return (r * 0.299 + g * 0.587 + b * 0.114) > 186
				            ? '#000000'
				            : '#FFFFFF';
				    }
				    // invert color components
				    r = (255 - r).toString(16);
				    g = (255 - g).toString(16);
				    b = (255 - b).toString(16);
				    // pad each with zeros and return
				    return "#" + padZero(r) + padZero(g) + padZero(b);
				}
			}
		});

		Vue.component('advertiser-table', {
			template: "#advertiser-table",
			props: ['data','parties','politicians', 'suggestengine'],
			methods: {
				topparties: function(x) {
					return this.parties[1].list.slice(0,x);
				},
				suggestParty: function(advertiser) {
					// console.log("Suggesting for "+advertiser.advertiser+", with "+this.politicians.length+" possible matches")
					var App = this;
					var likelyParties = new Set();

					if(this.suggestengine) {
						var matchedEntities = this.politicians.filter(function(candidate) {
							return (
								candidate.name == advertiser.advertiser
								|| (
									candidate.facebook && candidate.facebook != ""
									&& (
										candidate.facebook.includes(advertiser.advertiser_id) // Might have a weird old one like https://www.facebook.com/Alan-Duncan-150454050066
										||
										(
											advertiser.advertiser_vanity
											&& advertiser.advertiser_vanity != ""
											&& candidate.facebook.includes(advertiser.advertiser_vanity) // Likely that newer profiles will use a vanity url
										)
									)
								)
							)
						});

						if(matchedEntities.length && matchedEntities.length > 0) {
							// console.log("Matches for "+advertiser.advertiser,matchedEntities)
							matchedEntities.forEach(function(entity) {
								likelyParties.add(entity.party);
							});
						}
					}

					likelyParties = Array.from(likelyParties)
					likelyParties = likelyParties.map((id) => App.parties[1].list.find((someParty)=> someParty.id == id) );
					return likelyParties;
				}
			}
		});

		var App = new Vue({
			el: '#app',
			data: {
				advertisers: advertisers, // To be loaded from the DB
				parties: parties, // To be loaded from the DB
				adverts: adverts, // To be loaded from the DB
				politicians: [],
				suggestengine: false,
				suggestionDatasets: [
					{url:"datasets/candidates-2015.json", data: []},
					{url:"datasets/everypolitician-term-56-reduced.json", data: []}
				]
			},
			created: function() {
				var App = this;
				App.suggestionDatasets.forEach(function(dataset,index) {
					$.getJSON(dataset.url, function(dataJSON) {
						console.log("Loaded "+dataset.url);
						App.suggestionDatasets[index].data = dataJSON
						App.$forceUpdate();
					});
				});
			},
			watch: {
				'advertisers': {
					handler: function(newAds, oldAds) {
						var App = this;
						// Sanitise newArray. For any element with political == 'false' or '', clear element affiliation
						App.advertisers.forEach(function(advertiser,index) {
							if(advertiser.political == 'false' || advertiser.political == '') {
								console.log("Clearing affil for "+advertiser.advertiser)
								App.advertisers[index].affiliation = '';
							}
						})
						this.$forceUpdate();
						graph();
					},
					deep: true
				}
			},
			computed: {
				politicianDB: function() {
					if(this.suggestionDatasets.filter((dataset) => dataset.data.length == 0).length == 0) {
						console.log("Suggestion Engine ready!");
						App.suggestengine = true;
						var returnArr = [];
						this.suggestionDatasets.forEach(function(dataset) {
							returnArr = returnArr.concat(dataset.data);
						})
						return returnArr;
					} else {
						return [];
					}
				},
				advertisersToClassify: function() {
					var result = this.advertisers.filter(function (advertiser) {
						return (
							advertiser.political == '' ||
							(
								advertiser.political == 'true' &&
								advertiser.affiliation == ''
							)
						)
					})
					console.log("To-do",result);
					return result;
				},
				advertisersClassified: function() {
					var result=  this.advertisers.filter(function (advertiser) {
						return (
							advertiser.political == 'false' ||
							(
								advertiser.political == 'true' &&
								advertiser.affiliation != ''
							)
						)
					})
					console.log("Classified",result);
					return result.sort((a,b) => b.touchedDate - a.touchedDate );
				},
				politicalAds: function() {
					var App = this;
					var politicalStats = [{
							x: "political",
							y: App.adverts.filter(function(ad) {
									return App.advertisers.find((entity)=> entity.advertiser_id == ad.advertiser_id).political == "true"
								}).length
						}, {
							x: "nonpolitical",
							y: App.adverts.filter(function(ad) {
									return App.advertisers.find((entity)=> entity.advertiser_id == ad.advertiser_id).political != "true"
								}).length
						}
					]
					console.log(politicalStats)
					return politicalStats;
				},
				partyAds: function() {
					var App = this;
					var partyStats = {}
					App.adverts.forEach(function(ad) {
						var party = App.advertisers.find((entity)=> entity.advertiser_id == ad.advertiser_id).affiliation
						if(party != '') {
							if(partyStats[party] == undefined) partyStats[party] = {x:party, y:0};
							partyStats[party].y++;
							var foundParty = App.parties[1].list.find((p)=>p.id==party);
							partyStats[party].color = foundParty != undefined && foundParty != null ? "#"+foundParty.srgb : 'gray';
						}
						/*else {
							if(partyStats["Neutral"] == undefined) partyStats["Neutral"] = {x:"Neutral", y:0};
							partyStats["Neutral"].y++;
							partyStats["Neutral"].color = "gray"
						}*/
					})
					var result = []
					Object.keys(partyStats).forEach(function(party) {
						result.push(partyStats[party]);
					});
					console.log(result)
					return result;
				},
				partyColours: function() {
					return this.partyAds.map((party) => party.color);
				}
			}
		});

		/* ----
			Visualisations
		*/

		graph();

		$( window ).resize(() => graph() );

		function graph() {
			vega.embed("#political", {
				"$schema": "https://vega.github.io/schema/vega-lite/v2.json",
				"width": $("#political").width() * 0.7,
				"height": 150,
				"data": {
					"values": App.politicalAds
				},
				"mark": "bar",
				"encoding": {
					"y": {"field": "x", "type": "nominal", "axis": { "domain": false, "title": "", "labelPadding": 10 } },
					"x": {"field": "y", "type": "quantitative", "axis": { "domain": false, "title": "" } },
					"color": {
					  "field": "x",
					  "type": "nominal",
					  "scale": {"range": ["gray","red"]},
					  "legend": false
					}
				},
				"config": { "axis": { "labelFont": "lato", "ticks": false, "labelFontSize": 14, "labelColor":"#777" } }
				}, {
					"mode": "vega-lite",
					"actions": false,
					"config": {
						"autosize": { "type": "fit", "resize": true }
					}
				}, function(error, result) {
				});

			vega.embed("#parties", {
				"$schema": "https://vega.github.io/schema/vega-lite/v2.json",
				"width": $("#parties").width() * 0.7,
				"height": 150,
				"data": {
					"values": App.partyAds
				},
				"mark": "bar",
				"encoding": {
					"y": {"field": "x", "type": "nominal", "axis": { "domain": false, "title": "", "labelPadding": 10 } },
					"x": {"field": "y", "type": "quantitative", "axis": { "domain": false, "title": "" } },
					"color": {
					  "field": "x",
					  "type": "nominal",
					  "scale": {"range": App.partyColours},
					  "legend": false
					}
				},
				"config": { "axis": { "labelFont": "lato", "ticks": false, "labelFontSize": 14, "labelColor":"#777" } }
			}, {
				"mode": "vega-lite",
				"actions": false,
				"config": {
					"autosize": { "type": "fit", "resize": true }
				}
			}, function(error, result) {
			});
		}
	}
});
