'use strict'
var helper = require('./test-helper')
var Query = helper.pg.Query

var suite = new helper.Suite()

;(function () {
  var client = helper.client()
  client.on('drain', client.end.bind(client))

  var queryName = 'user by age and like name'
  var parseCount = 0

  suite.test('first named prepared statement', function (done) {
    var query = client.query(
      new Query({
        text: 'select name from person where age <= $1 and name LIKE $2',
        values: [20, 'Bri%'],
        name: queryName,
      })
    )

    assert.emits(query, 'row', function (row) {
      assert.equal(row.name, 'Brian')
    })

    query.on('end', () => done())
  })

  suite.test('second named prepared statement with same name & text', function (done) {
    var cachedQuery = client.query(
      new Query({
        text: 'select name from person where age <= $1 and name LIKE $2',
        name: queryName,
        values: [10, 'A%'],
      })
    )

    assert.emits(cachedQuery, 'row', function (row) {
      assert.equal(row.name, 'Aaron')
    })

    cachedQuery.on('end', () => done())
  })

  suite.test('with same name, but without query text', function (done) {
    var q = client.query(
      new Query({
        name: queryName,
        values: [30, '%n%'],
      })
    )

    assert.emits(q, 'row', function (row) {
      assert.equal(row.name, 'Aaron')

      // test second row is emitted as well
      assert.emits(q, 'row', function (row) {
        assert.equal(row.name, 'Brian')
      })
    })

    q.on('end', () => done())
  })

  suite.test('with same name, but with different text', function (done) {
    client.query(
      new Query({
        text: 'select name from person where age >= $1 and name LIKE $2',
        name: queryName,
        values: [30, '%n%'],
      }),
      assert.calls((err) => {
        assert.equal(
          err.message,
          `Prepared statements must be unique - '${queryName}' was used for a different statement`
        )
        done()
      })
    )
  })
})()
;(function () {
  var statementName = 'differ'
  var statement1 = 'select count(*)::int4 as count from person'
  var statement2 = 'select count(*)::int4 as count from person where age < $1'

  var client1 = helper.client()
  var client2 = helper.client()

  suite.test('client 1 execution', function (done) {
    var query = client1.query(
      {
        name: statementName,
        text: statement1,
      },
      (err, res) => {
        assert(!err)
        assert.equal(res.rows[0].count, 26)
        done()
      }
    )
  })

  suite.test('client 2 execution', function (done) {
    var query = client2.query(
      new Query({
        name: statementName,
        text: statement2,
        values: [11],
      })
    )

    assert.emits(query, 'row', function (row) {
      assert.equal(row.count, 1)
    })

    assert.emits(query, 'end', function () {
      done()
    })
  })

  suite.test('clean up clients', () => {
    return client1.end().then(() => client2.end())
  })
})()
;(function () {
  var client = helper.client()
  client.query('CREATE TEMP TABLE zoom(name varchar(100));')
  client.query("INSERT INTO zoom (name) VALUES ('zed')")
  client.query("INSERT INTO zoom (name) VALUES ('postgres')")
  client.query("INSERT INTO zoom (name) VALUES ('node postgres')")

  var checkForResults = function (q) {
    assert.emits(q, 'row', function (row) {
      assert.equal(row.name, 'node postgres')

      assert.emits(q, 'row', function (row) {
        assert.equal(row.name, 'postgres')

        assert.emits(q, 'row', function (row) {
          assert.equal(row.name, 'zed')
        })
      })
    })
  }

  suite.test('with small row count', function (done) {
    var query = client.query(
      new Query(
        {
          name: 'get names',
          text: 'SELECT name FROM zoom ORDER BY name COLLATE "C"',
          rows: 1,
        },
        done
      )
    )

    checkForResults(query)
  })

  suite.test('with large row count', function (done) {
    var query = client.query(
      new Query(
        {
          name: 'get names',
          text: 'SELECT name FROM zoom ORDER BY name COLLATE "C"',
          rows: 1000,
        },
        done
      )
    )
    checkForResults(query)
  })

  suite.testAsync('with no data response and rows', async function () {
    const result = await client.query({
      name: 'some insert',
      text: '',
      values: [],
      rows: 1,
    })
    assert.equal(result.rows.length, 0)
  })
  // suite.test('describe', async function (done) {
  //   const res = await client.query(
  //     new Query({ text: 'SELECT id, name, age FROM person WHERE age > $1', describe: true }, done)
  //   )
  //   console.log(res)
  //   console.log(res._result)
  //   assert.deepEqual(res.params, [])
  //   assert.deepEqual(
  //     res._result.fields.map((field) => ({ name: field.name, type: field.dataTypeID })),
  //     [
  //       { name: 'id', type: 23 },
  //       { name: 'name', type: 1043 },
  //       { name: 'age', type: 23 },
  //     ]
  //   )
  // })

  suite.test('cleanup', () => client.end())
})()
;(function () {
  var client = helper.client()
  client.on('drain', client.end.bind(client))
  if (!helper.config.native) {
    suite.test('describe', function (done) {
      client.query(
        new Query(
          {
            text: 'SELECT id, name, age FROM person WHERE age > $1',
            describe: true,
          },
          (er, res) => {
            console.error(er)
            assert.deepEqual(res.params[0].dataTypeIDs, [23])
            assert.deepEqual(
              res.fields.map((field) => ({ name: field.name, type: field.dataTypeID })),
              [
                { name: 'id', type: 23 },
                { name: 'name', type: 1043 },
                { name: 'age', type: 23 },
              ]
            )
            done()
          }
        )
      )
    })
  }
  suite.test('cleanup', () => client.end())
})()
