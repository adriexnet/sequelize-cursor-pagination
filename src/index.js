const { Op } = require('sequelize');

function encodeCursor(cursor) {
  return cursor ? Buffer.from(JSON.stringify(cursor)).toString('base64') : null;
}

function decodeCursor(cursor) {
  return cursor ? JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) : null;
}

function getPaginationQuery(cursor, cursorOrderOperator, paginationField, primaryKeyField) {
  if (paginationField !== primaryKeyField) {
    return {
      [Op.or]: [
        {
          [paginationField]: {
            [cursorOrderOperator]: cursor[0],
          },
        },
        {
          [paginationField]: cursor[0],
          [primaryKeyField]: {
            [cursorOrderOperator]: cursor[1],
          },
        },
      ],
    };
  } else {
    return {
      [paginationField]: {
        [cursorOrderOperator]: cursor[0],
      },
    };
  }
}

function withPagination({ methodName = 'paginate', primaryKeyField = 'id' } = {}) {
  return model => {
    const paginate = ({ group = '', where = {}, attributes = [], include = [], limit, before, after, desc = false, paginationField = primaryKeyField, raw = false, paranoid = true }) => {
      const decodedBefore = !!before ? decodeCursor(before) : null;
      const decodedAfter = !!after ? decodeCursor(after) : null;
      const cursorOrderIsDesc = before ? !desc : desc;
      const cursorOrderOperator = cursorOrderIsDesc ? Op.lt : Op.gt;
      const paginationFieldIsNonId = paginationField !== primaryKeyField;

      let paginationQuery;

      if (before) {
        paginationQuery = getPaginationQuery(decodedBefore, cursorOrderOperator, paginationField, primaryKeyField);
      } else if (after) {
        paginationQuery = getPaginationQuery(decodedAfter, cursorOrderOperator, paginationField, primaryKeyField);
      }

      const whereQuery = paginationQuery
        ? { [Op.and]: [paginationQuery, where] }
        : where;
      
      let order = [];
      if (Array.isArray(paginationField)) {
        order = paginationField;
      } else {
        order.push(
          cursorOrderIsDesc ? [paginationField, 'DESC'] : paginationField,
        );
      }

      return model.findAll({
        where: whereQuery,
        group,
        include,
        limit: limit + 1,
        order: [
          ...order,
          ...(paginationFieldIsNonId ? [primaryKeyField] : []),
        ],
        ...(Array.isArray(attributes) && attributes.length) ? { attributes } : {},
        raw,
        paranoid,
      }).then(results => {
        const hasMore = results.length > limit;

        if (hasMore) {
          results.pop();
        }

        if (before) {
          results.reverse();
        }

        const hasNext = !!before || hasMore;
        const hasPrevious = !!after || (!!before && hasMore);

        let beforeCursor = null;
        let afterCursor = null;

        if (results.length > 0) {
          beforeCursor = paginationFieldIsNonId
            ? encodeCursor([results[0][paginationField], results[0][primaryKeyField]])
            : encodeCursor([results[0][paginationField]]);

          afterCursor = paginationFieldIsNonId
            ? encodeCursor([results[results.length - 1][paginationField], results[results.length - 1][primaryKeyField]])
            : encodeCursor([results[results.length - 1][paginationField]]);
        }

        return {
          results,
          cursors: {
            hasNext,
            hasPrevious,
            before: beforeCursor,
            after: afterCursor,
          },
        };
      });
    };

    model[methodName] = paginate;
  };
}

module.exports = withPagination;
