(function(root){
'use strict';
const bank={
  "version": "gunshots-20260929-v1",
  "base": "audio/gunshots/",
  "profiles": {
    "pistol380": {
      "files": [
        "pistol380-1.mp3",
        "pistol380-2.mp3"
      ],
      "gain": 1
    },
    "pistol9": {
      "files": [
        "pistol9-1.mp3",
        "pistol9-2.mp3"
      ],
      "gain": 1
    },
    "pistol45": {
      "files": [
        "pistol45-1.mp3",
        "pistol45-2.mp3"
      ],
      "gain": 1
    },
    "revolver38": {
      "files": [
        "revolver38-1.mp3",
        "revolver38-2.mp3"
      ],
      "gain": 1
    },
    "ppsh": {
      "files": [
        "ppsh-1.mp3",
        "ppsh-2.mp3"
      ],
      "gain": 1
    },
    "smg9": {
      "files": [
        "smg9-1.mp3",
        "smg9-2.mp3"
      ],
      "gain": 0.88
    },
    "ar556": {
      "files": [
        "ar556-1.mp3",
        "ar556-2.mp3"
      ],
      "gain": 1
    },
    "ak762": {
      "files": [
        "ak762-1.mp3",
        "ak762-2.mp3"
      ],
      "gain": 1
    },
    "mosin": {
      "files": [
        "mosin-1.mp3",
        "mosin-2.mp3"
      ],
      "gain": 1
    },
    "sks": {
      "files": [
        "sks-1.mp3",
        "sks-2.mp3"
      ],
      "gain": 1
    },
    "rifle300": {
      "files": [
        "rifle300-1.mp3",
        "rifle300-2.mp3"
      ],
      "gain": 1
    },
    "rifle3006": {
      "files": [
        "rifle3006-1.mp3",
        "rifle3006-2.mp3"
      ],
      "gain": 1
    },
    "suppressed": {
      "files": [
        "suppressed-1.mp3"
      ],
      "gain": 0.48
    },
    "shotgun_cd": {
      "files": [
        "shotgun_cd-1.mp3",
        "shotgun_cd-2.mp3"
      ],
      "gain": 1
    },
    "shotgun_mossberg": {
      "files": [
        "shotgun_mossberg-1.mp3",
        "shotgun_mossberg-2.mp3"
      ],
      "gain": 1
    },
    "shotgun_winchester": {
      "files": [
        "shotgun_winchester-1.mp3",
        "shotgun_winchester-2.mp3"
      ],
      "gain": 1
    },
    "shotgun_benelli": {
      "files": [
        "shotgun_benelli-1.mp3",
        "shotgun_benelli-2.mp3"
      ],
      "gain": 1
    },
    "gauss": {
      "files": [
        "gauss-1.mp3"
      ],
      "gain": 1
    }
  },
  "weapons": {
    "1": {
      "name": "Пистолет Макарова",
      "profile": "pistol380",
      "rate": 0.98,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "2": {
      "name": "Пистолет ПСМ",
      "profile": "pistol380",
      "rate": 1.09,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "3": {
      "name": "Пистолет ИЖ-71",
      "profile": "pistol380",
      "rate": 1.02,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "4": {
      "name": "Обрез охотничьего ружья",
      "profile": "shotgun_cd",
      "rate": 1.1,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 260
      }
    },
    "5": {
      "name": "Пистолет ОЦ-33 «Пернач»",
      "profile": "pistol9",
      "rate": 0.98,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "6": {
      "name": "Револьвер Наган",
      "profile": "revolver38",
      "rate": 1.05,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "7": {
      "name": "Пистолет ТТ",
      "profile": "ppsh",
      "rate": 1.02,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "8": {
      "name": "ПП «Кедр»",
      "profile": "smg9",
      "rate": 1.08,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 100
      }
    },
    "9": {
      "name": "ПП-19 «Бизон»",
      "profile": "smg9",
      "rate": 1.03,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 100
      }
    },
    "10": {
      "name": "Карабин Сайга-12",
      "profile": "shotgun_cd",
      "rate": 0.96,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "11": {
      "name": "Автомат АКС-74У",
      "profile": "ar556",
      "rate": 1.08,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 100
      }
    },
    "12": {
      "name": "Автомат АК-74",
      "profile": "ar556",
      "rate": 1.04,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 100
      }
    },
    "13": {
      "name": "Винтовка СВД",
      "profile": "mosin",
      "rate": 1.02,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "14": {
      "name": "Винтовка СКС",
      "profile": "sks",
      "rate": 1,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "15": {
      "name": "Автомат АК-103",
      "profile": "ak762",
      "rate": 1,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 100
      }
    },
    "16": {
      "name": "Карабин «Вепрь»",
      "profile": "ak762",
      "rate": 0.96,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 100
      }
    },
    "17": {
      "name": "Пулемёт РПК-74",
      "profile": "ar556",
      "rate": 0.97,
      "gain": 1,
      "burst": {
        "shots": 6,
        "intervalMs": 100
      }
    },
    "18": {
      "name": "Автомат АС «Вал»",
      "profile": "suppressed",
      "rate": 1,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 100
      }
    },
    "19": {
      "name": "Дробовик СПАС-12",
      "profile": "shotgun_cd",
      "rate": 1.01,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "20": {
      "name": "Дробовик Сайга-410",
      "profile": "shotgun_cd",
      "rate": 1.08,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "21": {
      "name": "Автомат АК-12",
      "profile": "ar556",
      "rate": 1.03,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 100
      }
    },
    "22": {
      "name": "Пулемёт ПКМ",
      "profile": "mosin",
      "rate": 0.95,
      "gain": 1,
      "burst": {
        "shots": 6,
        "intervalMs": 100
      }
    },
    "23": {
      "name": "Винтовка Т-5000",
      "profile": "rifle300",
      "rate": 1,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "24": {
      "name": "Винтовка СВДС",
      "profile": "mosin",
      "rate": 1.04,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "25": {
      "name": "Пулемёт РПД",
      "profile": "ak762",
      "rate": 0.96,
      "gain": 1,
      "burst": {
        "shots": 6,
        "intervalMs": 100
      }
    },
    "26": {
      "name": "Автомат АН-94 «Абакан»",
      "profile": "ar556",
      "rate": 1.05,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 100
      }
    },
    "27": {
      "name": "Винтовка ОРСИС T-5000M",
      "profile": "rifle3006",
      "rate": 1,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "28": {
      "name": "Винтовка СВ-98",
      "profile": "mosin",
      "rate": 1,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "29": {
      "name": "Пулемёт «Печенег»",
      "profile": "mosin",
      "rate": 0.94,
      "gain": 1,
      "burst": {
        "shots": 6,
        "intervalMs": 100
      }
    },
    "30": {
      "name": "Винтовка ВСС «Винторез»",
      "profile": "suppressed",
      "rate": 0.95,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "31": {
      "name": "Винтовка СВ-338",
      "profile": "rifle3006",
      "rate": 0.97,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "32": {
      "name": "Дробовик Сайга-12К",
      "profile": "shotgun_cd",
      "rate": 0.98,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "33": {
      "name": "Винтовка «Выхлоп»",
      "profile": "suppressed",
      "rate": 0.77,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "35": {
      "name": "Винтовка ОСВ-96",
      "profile": "rifle3006",
      "rate": 0.86,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "36": {
      "name": "Винтовка СВК",
      "profile": "mosin",
      "rate": 0.98,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "37": {
      "name": "Автомат АК-107",
      "profile": "ar556",
      "rate": 1.01,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 100
      }
    },
    "38": {
      "name": "Автомат ADAR 2-15",
      "profile": "ar556",
      "rate": 1.02,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 100
      }
    },
    "39": {
      "name": "Винтовка ORSIS T-5000 Sniper Pro",
      "profile": "rifle3006",
      "rate": 0.96,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "40": {
      "name": "Винтовка ВСК-94",
      "profile": "suppressed",
      "rate": 1.03,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "42": {
      "name": "Винтовка SR-25",
      "profile": "rifle300",
      "rate": 1.02,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "43": {
      "name": "Автомат ОЦ-14 «Гроза»",
      "profile": "ak762",
      "rate": 1,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 100
      }
    },
    "44": {
      "name": "Дробовик «Вепрь-12»",
      "profile": "shotgun_cd",
      "rate": 0.94,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "45": {
      "name": "Автомат АК-19",
      "profile": "ar556",
      "rate": 1.01,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 100
      }
    },
    "46": {
      "name": "Винтовка SSG 08",
      "profile": "rifle300",
      "rate": 1.04,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "47": {
      "name": "Автомат АК-АН «Абакан-100»",
      "profile": "suppressed",
      "rate": 0.92,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 100
      }
    },
    "48": {
      "name": "Винтовка Barrett M98B",
      "profile": "rifle3006",
      "rate": 0.93,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "49": {
      "name": "Винтовка Barrett M82",
      "profile": "rifle3006",
      "rate": 0.84,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "50": {
      "name": "Дробовик Benelli M4",
      "profile": "shotgun_benelli",
      "rate": 0.98,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "51": {
      "name": "Автомат ЛР-308",
      "profile": "ak762",
      "rate": 0.94,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 100
      }
    },
    "52": {
      "name": "Винтовка АСВК «Корд»",
      "profile": "rifle3006",
      "rate": 0.82,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "53": {
      "name": "Пулемёт «Печенег-СП»",
      "profile": "mosin",
      "rate": 0.93,
      "gain": 1,
      "burst": {
        "shots": 6,
        "intervalMs": 100
      }
    },
    "54": {
      "name": "Винтовка McMillan TAC-50",
      "profile": "rifle3006",
      "rate": 0.82,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "55": {
      "name": "Гаусс-пушка",
      "profile": "gauss",
      "rate": 1,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "56": {
      "name": "Дробовик AA-12",
      "profile": "shotgun_cd",
      "rate": 0.92,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "57": {
      "name": "Автомат HK416",
      "profile": "ar556",
      "rate": 1,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 100
      }
    },
    "58": {
      "name": "Винтовка Steyr HS .50",
      "profile": "rifle3006",
      "rate": 0.83,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "59": {
      "name": "Пулемёт M240",
      "profile": "rifle300",
      "rate": 0.96,
      "gain": 1,
      "burst": {
        "shots": 6,
        "intervalMs": 100
      }
    },
    "60": {
      "name": "Винтовка Accuracy International AXMC",
      "profile": "rifle3006",
      "rate": 0.94,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "61": {
      "name": "Пулемёт M60E6",
      "profile": "rifle300",
      "rate": 0.95,
      "gain": 1,
      "burst": {
        "shots": 6,
        "intervalMs": 100
      }
    },
    "62": {
      "name": "Дробовик Kel-Tec KSG",
      "profile": "shotgun_mossberg",
      "rate": 1.04,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "63": {
      "name": "Автомат АК-308",
      "profile": "ak762",
      "rate": 0.93,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 100
      }
    },
    "64": {
      "name": "Винтовка ORSIS T-5000 Elite",
      "profile": "rifle3006",
      "rate": 0.95,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "65": {
      "name": "Пулемёт «Утёс-М»",
      "profile": "rifle3006",
      "rate": 0.8,
      "gain": 1,
      "burst": {
        "shots": 6,
        "intervalMs": 100
      }
    },
    "66": {
      "name": "Винтовка Zastava M93 Black Arrow",
      "profile": "rifle3006",
      "rate": 0.86,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "67": {
      "name": "Пулемёт Minimi Mk3",
      "profile": "ar556",
      "rate": 0.96,
      "gain": 1,
      "burst": {
        "shots": 6,
        "intervalMs": 100
      }
    },
    "68": {
      "name": "Дробовик Franchi SPAS-15",
      "profile": "shotgun_cd",
      "rate": 0.97,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "69": {
      "name": "Автомат CZ Bren 2",
      "profile": "ar556",
      "rate": 1.03,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 100
      }
    },
    "70": {
      "name": "Винтовка Sako TRG-42",
      "profile": "rifle3006",
      "rate": 0.98,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "71": {
      "name": "Пулемёт FN MAG",
      "profile": "rifle300",
      "rate": 0.95,
      "gain": 1,
      "burst": {
        "shots": 6,
        "intervalMs": 100
      }
    },
    "72": {
      "name": "Винтовка Desert Tech HTI",
      "profile": "rifle3006",
      "rate": 0.81,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "73": {
      "name": "Прототип X-17",
      "profile": "rifle3006",
      "rate": 0.88,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "74": {
      "name": "Дробовик USAS-12",
      "profile": "shotgun_cd",
      "rate": 0.91,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "75": {
      "name": "Автомат SCAR-H",
      "profile": "ak762",
      "rate": 0.95,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 100
      }
    },
    "76": {
      "name": "Винтовка Blaser R93 Tactical 2",
      "profile": "rifle300",
      "rate": 0.99,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "77": {
      "name": "Пулемёт Negev NG7",
      "profile": "rifle300",
      "rate": 0.93,
      "gain": 1,
      "burst": {
        "shots": 6,
        "intervalMs": 100
      }
    },
    "78": {
      "name": "Винтовка Cheytac M200 Intervention",
      "profile": "rifle3006",
      "rate": 0.87,
      "gain": 1,
      "burst": {
        "shots": 2,
        "intervalMs": 350
      }
    },
    "86": {
      "name": "Beretta 21A Bobcat",
      "profile": "pistol380",
      "rate": 1.12,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "87": {
      "name": "Walther PPK",
      "profile": "pistol380",
      "rate": 1,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "88": {
      "name": "Glock 25",
      "profile": "pistol380",
      "rate": 1.04,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "89": {
      "name": "Walther P99",
      "profile": "pistol9",
      "rate": 1,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "90": {
      "name": "CZ 75",
      "profile": "pistol9",
      "rate": 0.99,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "91": {
      "name": "Glock 17",
      "profile": "pistol9",
      "rate": 1.02,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "92": {
      "name": "Beretta 92FS",
      "profile": "pistol9",
      "rate": 0.98,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "93": {
      "name": "SIG Sauer P226",
      "profile": "pistol9",
      "rate": 0.97,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "94": {
      "name": "HK USP",
      "profile": "pistol9",
      "rate": 0.95,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "95": {
      "name": "Glock 22",
      "profile": "pistol9",
      "rate": 0.93,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "96": {
      "name": "SIG Sauer P229",
      "profile": "pistol9",
      "rate": 0.95,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "97": {
      "name": "Glock 20",
      "profile": "pistol45",
      "rate": 0.94,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "98": {
      "name": "Colt 1911",
      "profile": "pistol45",
      "rate": 1,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "99": {
      "name": "Glock 21",
      "profile": "pistol45",
      "rate": 0.98,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "100": {
      "name": "CZ 97B",
      "profile": "pistol45",
      "rate": 0.97,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "101": {
      "name": "HK Mark 23",
      "profile": "pistol45",
      "rate": 0.96,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "102": {
      "name": "Taurus Judge",
      "profile": "revolver38",
      "rate": 0.95,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "103": {
      "name": "Smith & Wesson Model 29",
      "profile": "revolver38",
      "rate": 0.91,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "104": {
      "name": "Taurus Raging Bull",
      "profile": "revolver38",
      "rate": 0.86,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "105": {
      "name": "Desert Eagle Mark XIX",
      "profile": "pistol45",
      "rate": 0.84,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 180
      }
    },
    "106": {
      "name": "Дробовик Mossberg 500",
      "profile": "shotgun_mossberg",
      "rate": 1,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "107": {
      "name": "Дробовик Stoeger P3000",
      "profile": "shotgun_cd",
      "rate": 1.02,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "108": {
      "name": "Дробовик Remington 870",
      "profile": "shotgun_winchester",
      "rate": 1,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "109": {
      "name": "Дробовик Winchester Model 1300",
      "profile": "shotgun_winchester",
      "rate": 1.01,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "110": {
      "name": "Дробовик Ithaca 37",
      "profile": "shotgun_winchester",
      "rate": 1.03,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "111": {
      "name": "Дробовик Browning BPS",
      "profile": "shotgun_winchester",
      "rate": 0.99,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "112": {
      "name": "Дробовик Winchester SXP Defender",
      "profile": "shotgun_winchester",
      "rate": 1.02,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "113": {
      "name": "Дробовик Mossberg 590A1",
      "profile": "shotgun_mossberg",
      "rate": 0.97,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "114": {
      "name": "Дробовик Remington 870 MCS",
      "profile": "shotgun_winchester",
      "rate": 0.98,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "115": {
      "name": "Дробовик Benelli Nova",
      "profile": "shotgun_benelli",
      "rate": 1,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "116": {
      "name": "Дробовик TOZ-194",
      "profile": "shotgun_cd",
      "rate": 1,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "117": {
      "name": "Дробовик Remington 1100",
      "profile": "shotgun_winchester",
      "rate": 0.97,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "118": {
      "name": "Дробовик Beretta 1301 Tactical",
      "profile": "shotgun_benelli",
      "rate": 1.02,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "119": {
      "name": "Дробовик Fabarm STF/12",
      "profile": "shotgun_mossberg",
      "rate": 0.98,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "120": {
      "name": "Дробовик Winchester SX4",
      "profile": "shotgun_winchester",
      "rate": 0.98,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "121": {
      "name": "Дробовик Browning A5",
      "profile": "shotgun_winchester",
      "rate": 0.96,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "122": {
      "name": "Дробовик Remington 870 Magnum",
      "profile": "shotgun_winchester",
      "rate": 0.91,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "123": {
      "name": "Дробовик Benelli Vinci",
      "profile": "shotgun_benelli",
      "rate": 1.01,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "124": {
      "name": "Дробовик Ithaca Mag-10",
      "profile": "shotgun_winchester",
      "rate": 0.87,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    },
    "125": {
      "name": "Дробовик Remington SP-10",
      "profile": "shotgun_winchester",
      "rate": 0.86,
      "gain": 1,
      "burst": {
        "shots": 3,
        "intervalMs": 260
      }
    }
  }
};
root.COMBAT_SOUND_BANK=bank;
if(typeof module!=='undefined')module.exports=bank;
})(typeof window!=='undefined'?window:globalThis);
