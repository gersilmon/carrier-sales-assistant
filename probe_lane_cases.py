from app import lane_row_matches_email

cases = [
    ({'PU City': 'DEKALB', 'Cons City': 'SHEBOYGAN', 'PU St': 'IL', 'Cons St': 'WI'}, 'load from DeKalb IL to Sheboygan WI'),
    ({'PU City': 'ST LOUIS', 'Cons City': 'CHICAGO', 'PU St': 'MO', 'Cons St': 'IL'}, 'St Louis MO to Chi IL'),
    ({'PU City': 'JACKSONVILLE', 'Cons City': 'ATLANTA', 'PU St': 'FL', 'Cons St': 'GA'}, 'Jaxville FL to Atlanta GA'),
    ({'PU City': 'GURNEE', 'Cons City': 'DES MOINES', 'PU St': 'IL', 'Cons St': 'IA'}, 'Gurne IL to Des Moines IA'),
    ({'PU City': 'MINNEAPOLIS', 'Cons City': 'MILWAUKEE', 'PU St': 'MN', 'Cons St': 'WI'}, 'MN to WI'),
    ({'PU City': 'DEKALB', 'Cons City': 'SHEBOYGAN', 'PU St': 'IL', 'Cons St': 'WI'}, 'Need a lane in IL only'),
    ({'PU City': 'SOUTH BEND', 'Cons City': 'MILWAUKEE', 'PU St': 'IN', 'Cons St': 'WI'}, 'S Bend IN to Mke WI'),
    ({'PU City': 'ROCHESTER', 'Cons City': 'JOLIET', 'PU St': 'MN', 'Cons St': 'IL'}, 'Rochster MN to Jolt IL'),
    ({'PU City': 'CHICAGO', 'Cons City': 'AURORA', 'PU St': 'IL', 'Cons St': 'IL'}, 'Chicago IL to Auroa IL'),
    ({'PU City': 'BELLEVILLE', 'Cons City': 'ST LOUIS', 'PU St': 'IL', 'Cons St': 'MO'}, 'Belleville IL to Saint Louie MO'),
]
for idx, (row, text) in enumerate(cases, 1):
    result = lane_row_matches_email(row, text)
    print(idx, text, '=>', result)
