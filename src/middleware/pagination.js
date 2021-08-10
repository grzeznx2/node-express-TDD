const pagination = (req, res, next) => {
  const pageAsNumber = parseInt(req.query.page)
  const sizeAsNumber = parseInt(req.query.size)

  let page = Number.isNaN(pageAsNumber) ? 0 : pageAsNumber
  let size = Number.isNaN(sizeAsNumber) ? 10 : sizeAsNumber

  if (page < 0) page = 0

  if (size < 1 || size > 20) size = 10

  req.pagination = { page, size }
  next()
}

module.exports = pagination
