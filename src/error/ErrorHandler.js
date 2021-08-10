module.exports = (err, req, res, next) => {
  const { status, message, errors } = err

  let validationErrors

  if (errors) {
    validationErrors = {}
    errors.forEach(err => {
      validationErrors[err.param] = req.t(err.msg)
    })
  }

  res.status(status).send({ path: req.originalUrl, timestamp: new Date().getTime(), message: req.t(message), validationErrors })
}
